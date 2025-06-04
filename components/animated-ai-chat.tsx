"use client"

import { useEffect, useRef, useCallback, useTransition } from "react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  Paperclip,
  Command,
  SendIcon,
  XIcon,
  User,
  Bot,
  Upload,
  Check,
  Code,
  Copy,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import * as React from "react"
import { ChatService } from '../services/chatService';
import { ChatStreamResponse } from '../types/chat';
import settings from '../config/settings';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Components } from 'react-markdown';
import type { ComponentPropsWithoutRef } from 'react';
import { throttle } from 'lodash';

interface UseAutoResizeTextareaProps {
  minHeight: number
  maxHeight?: number
}

function useAutoResizeTextarea({ minHeight, maxHeight }: UseAutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current
      if (!textarea) return

      if (reset) {
        textarea.style.height = `${minHeight}px`
        textarea.style.overflowY = "hidden"
        return
      }

      // Store current scroll position and selection
      const scrollTop = textarea.scrollTop
      const selectionStart = textarea.selectionStart
      const selectionEnd = textarea.selectionEnd

      // Reset height to minimum to get accurate scrollHeight
      textarea.style.height = `${minHeight}px`
      textarea.style.overflowY = "hidden"

      // Force reflow to ensure accurate measurement
      textarea.offsetHeight

      // Calculate new height based on content
      const scrollHeight = textarea.scrollHeight
      const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY))

      // Apply new height
      textarea.style.height = `${newHeight}px`

      // Handle scrollbar visibility and restore state
      if (maxHeight && scrollHeight > maxHeight) {
        textarea.style.overflowY = "auto"
        // Restore scroll position if content was scrolled
        requestAnimationFrame(() => {
          textarea.scrollTop = scrollTop
          textarea.setSelectionRange(selectionStart, selectionEnd)
        })
      } else {
        textarea.style.overflowY = "hidden"
        // Restore selection
        requestAnimationFrame(() => {
          textarea.setSelectionRange(selectionStart, selectionEnd)
        })
      }
    },
    [minHeight, maxHeight],
  )

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = `${minHeight}px`
      textarea.style.overflowY = "hidden"
      textarea.style.resize = "none"
    }
  }, [minHeight])

  return { textareaRef, adjustHeight }
}

interface CommandOption {
  id: string
  icon: React.ReactNode
  label: string
  description: string
  prefix: string
  disabled?: boolean
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  containerClassName?: string
  showRing?: boolean
  isFocused?: boolean
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, containerClassName, showRing = true, isFocused = false, ...props }, ref) => {
    const isProjectRetrievalMode = React.useContext(ProjectRetrievalModeContext)

    return (
      <div className={cn("relative", containerClassName)}>
        <textarea
          className={cn(
            "flex min-h-[60px] w-full rounded-xl border-0 bg-transparent px-4 py-3 text-base",
            "transition-all duration-200 ease-out",
            "placeholder:text-gray-400",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "focus:outline-none focus:ring-0",
            "resize-none",
            "scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent",
            "leading-relaxed",
            className,
          )}
          ref={ref}
          {...props}
        />

        <AnimatePresence>
          {showRing && isFocused && (
            <motion.div
              className={cn(
                "absolute inset-0 rounded-xl pointer-events-none border-2 shadow-sm",
                isProjectRetrievalMode ? "border-blue-500" : "border-green-500",
              )}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
      </div>
    )
  },
)
Textarea.displayName = "Textarea"

interface Message {
  id: string
  content: string
  role: "user" | "assistant"
  timestamp: Date
  isProjectRetrieval?: boolean
}

interface FileUpload {
  name: string
  size: string
  type: string
  file: File
}

const ProjectRetrievalModeContext = React.createContext(false)

interface CodeProps extends ComponentPropsWithoutRef<'code'> {
  inline?: boolean;
  className?: string;
  node?: any;
}

// 添加文件类型和大小常量
const FILE_CONSTRAINTS = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: [
    "text/plain",
    "application/pdf",
    "application/json",
    "text/markdown",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/msword", // .doc
    "application/vnd.ms-excel", // .xls
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  ],
  MAX_FILES: 5, // 最大文件数量限制
  ALLOWED_EXTENSIONS: ['.pdf', '.docx', '.xlsx', '.doc', '.xls', '.txt', '.json', '.md'],
};

// 添加滚动相关的常量
const SCROLL_CONSTANTS = {
  SCROLL_THRESHOLD: 100, // 距离底部多少像素时触发自动滚动
  SCROLL_DELAY: 100, // 滚动延迟时间（毫秒）
  UPDATE_THROTTLE: 100, // 消息更新节流时间（毫秒）
};

export function AnimatedAIChat() {
  const [value, setValue] = useState("")
  const [attachments, setAttachments] = useState<string[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<FileUpload[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isPending, startTransition] = useTransition()
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [messages, setMessages] = useState<Message[]>([])
  const [hasStartedChat, setHasStartedChat] = useState(false)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [inputFocused, setInputFocused] = useState(false)
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true)
  const [isWaitingResponse, setIsWaitingResponse] = useState(false)
  const [isComposing, setIsComposing] = useState(false)

  // Enhanced command system state
  const [showCommandMenu, setShowCommandMenu] = useState(false)
  const [activeCommands, setActiveCommands] = useState<Set<string>>(new Set())

  const fileInputRef = useRef<HTMLInputElement>(null)
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 60,
    maxHeight: 160,
  })
  const commandMenuRef = useRef<HTMLDivElement>(null)
  const uploadDialogRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  const chatService = useRef(new ChatService()).current;
  const [currentResponse, setCurrentResponse] = useState<string>('');

  const commandOptions: CommandOption[] = [
    {
      id: "project-retrieval",
      icon: <Code className="w-4 h-4" />,
      label: "项目检索",
      description: "检索和查看项目数据",
      prefix: "/project",
      disabled: true,
    },
  ]

  // 获取当前激活的 agentId
  const getCurrentAgentId = useCallback(() => {
    if (activeCommands.has('project-retrieval')) {
      return settings.AGENT_UUIDS.PROJECT_RECOMMEND;
    }
    return settings.AGENT_UUIDS.NORMAL_QA;
  }, [activeCommands]);

  // 更新 ChatService 的 agentId
  useEffect(() => {
    const agentId = getCurrentAgentId();
    chatService.updateAgentId(agentId);
  }, [activeCommands, getCurrentAgentId]);

  // 使用 useRef 存储节流函数
  const throttledUpdate = useRef(
    throttle((messageId: string, content: string) => {
      setMessages(prev => 
        prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, content } 
            : msg
        )
      );
    }, SCROLL_CONSTANTS.UPDATE_THROTTLE)
  );

  const handleCopyMessage = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopiedMessageId(message.id)
      setTimeout(() => setCopiedMessageId(null), 2500)
    } catch (err) {
      console.error("Failed to copy text: ", err)
    }
  }

  // Enhanced command system functions
  const toggleCommandMenu = () => {
    setShowCommandMenu((prev) => !prev)
  }

  const selectCommand = (commandId: string) => {
    setActiveCommands(new Set([commandId])) // Only allow one active command
    setShowCommandMenu(false)
  }

  const removeActiveCommand = (commandId: string) => {
    setActiveCommands((prev) => {
      const newSet = new Set(prev)
      newSet.delete(commandId)
      return newSet
    })
  }

  const getActiveCommandsText = () => {
    return (
      Array.from(activeCommands)
        .map((id) => commandOptions.find((cmd) => cmd.id === id)?.prefix)
        .filter(Boolean)
        .join(" ") + (activeCommands.size > 0 ? " " : "")
    )
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener("mousemove", handleMouseMove)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const commandButton = document.querySelector("[data-command-button]")
      const uploadButton = document.querySelector("[data-upload-button]")
      const inputContainer = document.querySelector("[data-input-container]")

      // Handle command menu
      if (commandMenuRef.current && !commandMenuRef.current.contains(target) && !commandButton?.contains(target)) {
        setShowCommandMenu(false)
      }

      // Handle upload dialog
      if (
        uploadDialogRef.current &&
        !uploadDialogRef.current.contains(target) &&
        !uploadButton?.contains(target) &&
        !(target as HTMLElement).closest('input[type="file"]')
      ) {
        setShowUploadDialog(false)
      }

      // Handle input focus
      if (inputContainer && !inputContainer.contains(target)) {
        setInputFocused(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  // 优化自动滚动逻辑
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior,
        block: 'end',
      });
    }
  }, []);

  // 优化滚动检测
  const handleScroll = useCallback(() => {
    if (!chatContainerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < SCROLL_CONSTANTS.SCROLL_THRESHOLD;
    
    setShouldScrollToBottom(isNearBottom);
  }, []);

  // 添加滚动事件监听
  useEffect(() => {
    const container = chatContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // 优化消息更新时的滚动行为
  useEffect(() => {
    if (shouldScrollToBottom) {
      // 使用 requestAnimationFrame 确保在 DOM 更新后执行滚动
      requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
    }
  }, [messages, shouldScrollToBottom, scrollToBottom]);

  // 优化状态重置
  const resetChatState = useCallback(() => {
    setMessages([]);
    setHasStartedChat(false);
    setValue("");
    setCurrentResponse("");
    setSelectedFiles([]);
    setAttachments([]);
    setUploadedFiles([]);
    setShowUploadDialog(false);
    setShouldScrollToBottom(true);
  }, []);

  // 添加页面刷新时的清理逻辑
  useEffect(() => {
    const handleBeforeUnload = () => {
      resetChatState();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [resetChatState]);

  // 优化消息发送后的状态更新
  const updateMessageState = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
    setHasStartedChat(true);
    setValue("");
    setCurrentResponse("");
    
    // 重置输入状态
    requestAnimationFrame(() => {
      adjustHeight(true);
      setInputFocused(false);
      setActiveCommands(new Set());
    });
    
    // 启用自动滚动
    setShouldScrollToBottom(true);
  }, []);

  // 添加键盘事件处理
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isWaitingResponse && !isComposing) {
      e.preventDefault();
      if (value.trim()) {
        handleSendMessage();
      }
    }
  }, [value, isWaitingResponse, isComposing]);

  const handleCompositionStart = useCallback(() => {
    setIsComposing(true);
  }, []);

  const handleCompositionEnd = useCallback(() => {
    setIsComposing(false);
  }, []);

  const handleSendMessage = async () => {
    if (value.trim()) {
      const isProjectRetrievalActive = activeCommands.has("project-retrieval");

      const userMessage: Message = {
        id: `msg-${performance.now().toString().replace('.', '')}`,
        content: value.trim(),
        role: "user",
        timestamp: new Date(),
        isProjectRetrieval: isProjectRetrievalActive,
      };

      updateMessageState(userMessage);
      
      // 设置等待响应状态
      setIsWaitingResponse(true);
      
      // 立即滚动到底部
      requestAnimationFrame(() => {
        scrollToBottom('auto');
      });

      // 使用已确认的文件列表
      const filesToSend = Array.from(fileMap.values());

      startTransition(() => {
        // 创建初始占位消息
        const tempMessageId = `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        setMessages((prev) => [
          ...prev,
          {
            id: tempMessageId,
            content: "",
            role: "assistant",
            timestamp: new Date(),
            isProjectRetrieval: isProjectRetrievalActive,
          },
        ]);

        // 调用聊天服务
        chatService
          .chatStream(value.trim(), activeCommands, filesToSend)
          .then(async (stream) => {
            const reader = stream.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let content = "";

            const processBuffer = () => {
              if (!buffer.includes("\n")) return;

              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              lines.forEach(line => {
                if (line.startsWith("data:")) {
                  try {
                    const jsonStr = line.slice(5).trim();
                    if (jsonStr) {
                      const data = JSON.parse(jsonStr) as ChatStreamResponse;
                      
                      // 保存 chatId 到聊天状态
                      if (data.chatId) {
                        const agentId = getCurrentAgentId();
                        const chatState = chatService.getChatState(agentId);
                        chatState.chatId = data.chatId;
                      }

                      if (data.content) {
                        content += data.content;
                        throttledUpdate.current(tempMessageId, content);
                      }

                      if (data.finish) {
                        setCurrentResponse("");
                        // 响应完成时重置等待状态
                        setIsWaitingResponse(false);
                      }
                    }
                  } catch (error) {
                    console.error("解析 SSE 数据失败:", error, "原始数据:", line);
                    // 发生错误时也要重置等待状态
                    setIsWaitingResponse(false);
                  }
                }
              });
            };

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                
                // 使用递归确保处理完所有完整行
                while (buffer.includes("\n")) {
                  processBuffer();
                }
              }

              // 处理剩余数据
              if (buffer) processBuffer();
            } catch (error) {
              console.error("流处理错误:", error);
              setCurrentResponse("");
              // 移除占位消息
              setMessages((prev) => prev.filter((msg) => msg.id !== tempMessageId));
              // 发生错误时重置等待状态
              setIsWaitingResponse(false);
            } finally {
              reader.releaseLock();
            }
          })
          .catch((error) => {
            console.error("Chat error:", error);
            setCurrentResponse("");
            // 移除占位消息
            setMessages((prev) => prev.filter((msg) => msg.id !== tempMessageId));
            // 发生错误时重置等待状态
            setIsWaitingResponse(false);
          });
      });
    }
  };

  const handleAttachFile = () => {
    setShowUploadDialog(prev => !prev)
  }

  const [fileMap, setFileMap] = useState<Map<string, File>>(new Map());

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    // 检查文件数量限制
    if (files.length + fileMap.size > FILE_CONSTRAINTS.MAX_FILES) {
      alert(`最多只能上传 ${FILE_CONSTRAINTS.MAX_FILES} 个文件`);
      e.target.value = '';
      return;
    }

    // 过滤和验证文件
    const validFiles = files.filter(file => {
      // 检查文件大小
      if (file.size > FILE_CONSTRAINTS.MAX_SIZE) {
        alert(`${file.name} 超过10MB限制`);
        return false;
      }
      
      // 检查文件类型和扩展名
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ext || !FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.includes(`.${ext}`) || 
          !FILE_CONSTRAINTS.ALLOWED_TYPES.includes(file.type)) {
        alert(`${file.name} 类型不支持`);
        return false;
      }
      
      // 检查是否重复
      if (fileMap.has(file.name)) {
        alert(`${file.name} 已存在`);
        return false;
      }
      
      return true;
    });

    if (validFiles.length > 0) {
      const newFiles: FileUpload[] = validFiles.map(file => {
        const fileSizeInKB = Math.round(file.size / 1024);
        const fileSizeStr = fileSizeInKB < 1024 
          ? `${fileSizeInKB} KB` 
          : `${(fileSizeInKB / 1024).toFixed(1)} MB`;
        
        return {
          name: file.name,
          size: fileSizeStr,
          type: file.type,
          file: file
        };
      });
      
      setUploadedFiles(prev => [...prev, ...newFiles]);
    }
    
    e.target.value = '';
  };

  const confirmFileUpload = () => {
    // 使用 Map 结构更新文件
    setFileMap(prev => {
      const newMap = new Map(prev);
      uploadedFiles.forEach(f => {
        if (!newMap.has(f.name)) {
          newMap.set(f.name, f.file);
        }
      });
      return newMap;
    });

    // 更新显示附件列表
    setAttachments(prev => {
      const newAttachments = uploadedFiles.map(f => f.name);
      return [...new Set([...prev, ...newAttachments])].slice(0, FILE_CONSTRAINTS.MAX_FILES);
    });
    
    // 清空临时上传状态
    setUploadedFiles([]);
    setShowUploadDialog(false);
  };

  const removeAttachment = (index: number) => {
    const attachmentName = attachments[index];
    
    // 从 Map 中删除文件
    setFileMap(prev => {
      const newMap = new Map(prev);
      newMap.delete(attachmentName);
      return newMap;
    });
    
    // 更新显示附件列表
    setAttachments(prev => prev.filter((_, i) => i !== index));
    
    // 如果删除后没有文件了，重置相关状态
    if (attachments.length === 1) {
      setShowUploadDialog(false);
    }
  };

  const handleInputFocus = () => {
    setInputFocused(true)
  }

  const isProjectRetrievalMode = activeCommands.has("project-retrieval")

  const renderMessageContent = (message: Message) => {
    if (message.role === "user") {
      return <div className="text-white">{message.content}</div>;
    }

    const components: Components = {
      h1: (props: ComponentPropsWithoutRef<'h1'>) => (
        <h1 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-200" {...props} />
      ),
      h2: (props: ComponentPropsWithoutRef<'h2'>) => (
        <h2 className="text-xl font-semibold text-gray-800 mb-4 mt-8" {...props} />
      ),
      h3: (props: ComponentPropsWithoutRef<'h3'>) => (
        <h3 className="text-lg font-medium text-gray-700 mb-3 mt-6" {...props} />
      ),
      p: (props: ComponentPropsWithoutRef<'p'>) => (
        <p className="mb-4 text-gray-700 leading-relaxed" {...props} />
      ),
      ul: (props: ComponentPropsWithoutRef<'ul'>) => (
        <ul className="list-disc ml-6 mb-4 text-gray-700" {...props} />
      ),
      ol: (props: ComponentPropsWithoutRef<'ol'>) => (
        <ol className="list-decimal ml-6 mb-4 text-gray-700" {...props} />
      ),
      li: (props: ComponentPropsWithoutRef<'li'>) => (
        <li className="mb-2" {...props} />
      ),
      blockquote: (props: ComponentPropsWithoutRef<'blockquote'>) => (
        <blockquote className="border-l-4 border-green-500 pl-4 py-2 my-4 bg-green-50 text-gray-700 italic" {...props} />
      ),
      a: (props: ComponentPropsWithoutRef<'a'>) => (
        <a className="text-green-600 hover:text-green-700 underline" target="_blank" rel="noopener noreferrer" {...props} />
      ),
      code: ({ node, inline, className, children, ...props }: CodeProps) => {
        if (inline) {
          return (
            <code className="bg-gray-100 rounded px-1 text-gray-800" {...props}>
              {children}
            </code>
          );
        }
        return (
          <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto my-4">
            <code className={className} {...props}>
              {children}
            </code>
          </pre>
        );
      },
    };

    return (
      <div className="prose prose-sm max-w-none text-gray-900 leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={components}
        >
          {message.content}
        </ReactMarkdown>
      </div>
    );
  };

  return (
    <ProjectRetrievalModeContext.Provider value={isProjectRetrievalMode}>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-gray-50 via-white to-gray-50 text-gray-900 relative overflow-hidden font-apple">
        {/* Enhanced Background Effects */}
        <div className="absolute inset-0 w-full h-full overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-green-500/[0.015] rounded-full mix-blend-normal filter blur-[128px] animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/[0.015] rounded-full mix-blend-normal filter blur-[128px] animate-pulse delay-700" />
          <div className="absolute top-1/4 right-1/3 w-64 h-64 bg-teal-500/[0.015] rounded-full mix-blend-normal filter blur-[96px] animate-pulse delay-1000" />
          <div className="absolute inset-0 bg-gradient-to-t from-white/70 to-transparent pointer-events-none" />
        </div>

        {/* Main Layout Container */}
        <div className="flex w-full h-screen relative z-10 overflow-hidden">
          {/* Main Chat Area */}
          <motion.div
            className="flex flex-col h-full"
            animate={{
              width: "100%",
            }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* Chat Messages Area */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <AnimatePresence>
                {hasStartedChat && (
                  <motion.div
                    ref={chatContainerRef}
                    className="flex-1 overflow-y-auto px-6 py-8 max-w-4xl mx-auto w-full scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    style={{ scrollBehavior: "smooth" }}
                  >
                    <div className="space-y-8">
                      {messages.map((message, index) => (
                        <motion.div
                          key={message.id}
                          className={cn(
                            "flex gap-4 max-w-4xl",
                            message.role === "user" ? "justify-end" : "justify-start",
                          )}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                        >
                          {message.role === "assistant" && (
                            <div
                              className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm border",
                                message.isProjectRetrieval
                                  ? "bg-gradient-to-br from-blue-100 to-blue-200 border-blue-200/50"
                                  : "bg-gradient-to-br from-green-100 to-green-200 border-green-200/50",
                              )}
                            >
                              <Bot
                                className={cn(
                                  "w-5 h-5",
                                  message.isProjectRetrieval ? "text-blue-700" : "text-green-700",
                                )}
                              />
                            </div>
                          )}

                          <div className="flex flex-col gap-4 max-w-[75%]">
                            <div
                              className={cn(
                                "rounded-2xl px-6 py-4 text-sm leading-relaxed message-bubble shadow-sm",
                                message.role === "user"
                                  ? message.isProjectRetrieval
                                    ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white ml-auto user"
                                    : "bg-gradient-to-br from-green-500 to-green-600 text-white ml-auto user"
                                  : "bg-white text-gray-900 assistant border border-gray-200/80 backdrop-blur-sm",
                              )}
                            >
                              {message.content ? renderMessageContent(message) : (message.role === "assistant" && <TypingDots />)}
                            </div>

                            {/* Enhanced Copy Button */}
                            {message.role === "assistant" && (
                              <motion.button
                                onClick={() => handleCopyMessage(message)}
                                className={cn(
                                  "self-start flex items-center gap-2 px-4 py-2.5 text-xs rounded-full transition-all duration-200",
                                  copiedMessageId === message.id
                                    ? message.isProjectRetrieval
                                      ? "bg-blue-50 text-blue-600 shadow-sm"
                                      : "bg-green-50 text-green-600 shadow-sm"
                                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                                )}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                              >
                                <AnimatePresence mode="wait">
                                  {copiedMessageId === message.id ? (
                                    <motion.div
                                      key="check"
                                      className="flex items-center gap-2"
                                      initial={{ opacity: 0, scale: 0.8 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.8 }}
                                      transition={{ duration: 0.2 }}
                                    >
                                      <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                        className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center"
                                      >
                                        <Check className="w-2.5 h-2.5" />
                                      </motion.div>
                                      <motion.span
                                        initial={{ opacity: 0, x: -5 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.1 }}
                                      >
                                        已复制
                                      </motion.span>
                                    </motion.div>
                                  ) : (
                                    <motion.div
                                      key="copy"
                                      className="flex items-center gap-2"
                                      initial={{ opacity: 0, scale: 0.8 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.8 }}
                                      transition={{ duration: 0.2 }}
                                    >
                                      <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center">
                                        <Copy className="w-2.5 h-2.5" />
                                      </div>
                                      <span>复制</span>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </motion.button>
                            )}
                          </div>

                          {message.role === "user" && (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center flex-shrink-0 shadow-sm border border-gray-300/50">
                              <User className="w-5 h-5 text-gray-600" />
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                    <div ref={messagesEndRef} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Enhanced Welcome Screen */}
              {!hasStartedChat && (
                <div className="flex-1 flex items-center justify-center px-6">
                  <div className="w-full max-w-2xl mx-auto relative">
                    <motion.div
                      className="relative z-10 space-y-16"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    >
                      <div className="text-center space-y-8">
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2, duration: 0.5 }}
                          className="inline-block"
                        >
                          <h1 className="text-4xl font-semibold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-900 via-gray-800 to-gray-600 pb-2">
                            今天我能为您做些什么？
                          </h1>
                          <motion.div
                            className="h-0.5 bg-gradient-to-r from-transparent via-green-500/40 to-transparent rounded-full"
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: "100%", opacity: 1 }}
                            transition={{ delay: 0.5, duration: 0.8 }}
                          />
                        </motion.div>
                        <motion.p
                          className="text-base text-gray-600 max-w-md mx-auto leading-relaxed"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3 }}
                        >
                          输入命令或提出问题，开始我们的对话
                        </motion.p>
                      </div>
                    </motion.div>
                  </div>
                </div>
              )}
            </div>

            {/* Enhanced Input Area */}
            <div className={cn("relative z-10 px-6 pb-8", hasStartedChat ? "pt-6" : "pt-0")}>
              <div className="max-w-4xl mx-auto">
                <motion.div
                  data-input-container
                  className="relative backdrop-blur-xl bg-white/95 rounded-2xl border border-gray-200/80 shadow-xl"
                  layout
                  transition={{ duration: 0.3 }}
                >
                  {/* Enhanced Command Menu */}
                  <AnimatePresence>
                    {showCommandMenu && (
                      <motion.div
                        ref={commandMenuRef}
                        className="absolute left-4 right-4 bottom-full mb-3 bg-white rounded-xl z-50 shadow-xl border border-gray-200 overflow-hidden"
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                      >
                        <div className="p-2">
                          <div className="text-xs font-medium text-gray-500 px-3 py-2 mb-1">可用命令</div>
                          {commandOptions.map((option) => {
                            const isActive = activeCommands.has(option.id)
                            return (
                              <motion.button
                                key={option.id}
                                onClick={() => !option.disabled && selectCommand(option.id)}
                                className={cn(
                                  "flex items-center gap-3 px-3 py-3 text-sm transition-all w-full rounded-xl",
                                  option.disabled
                                    ? "opacity-50 cursor-not-allowed bg-gray-50 text-gray-400"
                                    : isActive
                                      ? option.id === "project-retrieval"
                                        ? "bg-blue-100 text-blue-800 border border-blue-200"
                                        : "bg-green-100 text-green-800 border border-green-200"
                                      : "text-gray-700 hover:bg-gray-50 cursor-pointer",
                                )}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                whileHover={!option.disabled ? { scale: 1.01 } : undefined}
                                whileTap={!option.disabled ? { scale: 0.99 } : undefined}
                              >
                                <div
                                  className={cn(
                                    "w-6 h-6 flex items-center justify-center rounded",
                                    option.disabled
                                      ? "text-gray-400"
                                      : isActive
                                        ? option.id === "project-retrieval"
                                          ? "text-blue-700"
                                          : "text-green-700"
                                        : "text-gray-600",
                                  )}
                                >
                                  {option.icon}
                                </div>
                                <div className="flex-1 text-left">
                                  <div className="font-medium">{option.label}</div>
                                  <div className="text-xs text-gray-500 mt-0.5">{option.description}</div>
                                </div>
                                <div
                                  className={cn(
                                    "text-xs font-mono px-2 py-1 rounded",
                                    option.disabled
                                      ? "bg-gray-100 text-gray-400"
                                      : isActive
                                        ? option.id === "project-retrieval"
                                          ? "bg-blue-200 text-blue-800"
                                          : "bg-green-200 text-green-800"
                                        : "bg-gray-100 text-gray-400",
                                  )}
                                >
                                  {option.prefix}
                                </div>
                                {isActive && !option.disabled && (
                                  <motion.div
                                    className={cn(
                                      "w-2 h-2 rounded-full",
                                      option.id === "project-retrieval" ? "bg-blue-500" : "bg-green-500",
                                    )}
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                  />
                                )}
                              </motion.button>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Enhanced File Upload Dialog */}
                  <AnimatePresence>
                    {showUploadDialog && (
                      <motion.div
                        ref={uploadDialogRef}
                        className="absolute left-4 right-4 bottom-full mb-3 bg-white rounded-xl z-50 shadow-xl border border-gray-200 overflow-hidden"
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                      >
                        <div className="p-6">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="text-base font-semibold text-gray-800">上传文件</h3>
                            <button
                              onClick={() => {
                                setSelectedFiles([])
                                setShowUploadDialog(false)
                              }}
                              className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                              <XIcon className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center mb-4 hover:border-green-400 hover:bg-green-50/30 transition-all">
                            <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleFileChange}
                              className="hidden"
                              multiple
                            />
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              className="flex flex-col items-center justify-center w-full text-gray-600 hover:text-gray-800 transition-colors"
                            >
                              <Upload className="w-8 h-8 mb-3 text-green-500" />
                              <span className="text-sm font-medium mb-1">点击选择文件或拖拽文件到此处</span>
                              <span className="text-xs text-gray-500">支持各种文件格式，最大 10MB</span>
                            </button>
                          </div>

                          {uploadedFiles.length > 0 && (
                            <div className="mb-4 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                              <div className="text-sm font-medium text-gray-700 mb-3">已选择的文件</div>
                              <div className="space-y-2">
                                {uploadedFiles.map((file, index) => (
                                  <motion.div
                                    key={index}
                                    className="flex items-center justify-between bg-gray-50 rounded-lg p-3 text-sm"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                  >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                      <Paperclip className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                      <span className="truncate font-medium">{file.name}</span>
                                      <span className="text-gray-500 flex-shrink-0 text-xs">{file.size}</span>
                                    </div>
                                    <button
                                      onClick={() => {
                                        setSelectedFiles(prev => prev.filter((_, i) => i !== index))
                                      }}
                                      className="text-gray-400 hover:text-red-500 ml-3 flex-shrink-0 p-1 rounded hover:bg-red-50 transition-colors"
                                    >
                                      <XIcon className="w-3 h-3" />
                                    </button>
                                  </motion.div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex justify-end gap-3">
                            <button
                              onClick={() => {
                                setSelectedFiles([])
                                setShowUploadDialog(false)
                              }}
                              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                            >
                              取消
                            </button>
                            <button
                              onClick={confirmFileUpload}
                              disabled={uploadedFiles.length === 0}
                              className={cn(
                                "px-4 py-2 text-sm rounded-xl transition-all flex items-center gap-2",
                                uploadedFiles.length > 0
                                  ? "bg-green-500 text-white hover:bg-green-600 shadow-sm"
                                  : "bg-gray-200 text-gray-400 cursor-not-allowed",
                              )}
                            >
                              <Check className="w-4 h-4" />
                              <span>确认上传</span>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Enhanced Input Field */}
                  <div className="p-6">
                    <Textarea
                      ref={textareaRef}
                      value={getActiveCommandsText() + value}
                      onChange={(e) => {
                        const fullValue = e.target.value
                        const commandsText = getActiveCommandsText()
                        const userInput = fullValue.slice(commandsText.length)
                        setValue(userInput)

                        // Use requestAnimationFrame for smoother height adjustment
                        requestAnimationFrame(() => {
                          adjustHeight()
                        })
                      }}
                      onKeyDown={handleKeyDown}
                      onCompositionStart={handleCompositionStart}
                      onCompositionEnd={handleCompositionEnd}
                      onFocus={handleInputFocus}
                      isFocused={inputFocused}
                      placeholder="向 AI 助手提问..."
                      containerClassName="w-full"
                      className={cn(
                        "w-full",
                        isProjectRetrievalMode ? "text-blue-900" : "text-gray-900",
                        isProjectRetrievalMode ? "placeholder:text-blue-400" : "placeholder:text-gray-500",
                      )}
                      showRing={true}
                    />
                  </div>

                  {/* Active Commands Display */}
                  <AnimatePresence>
                    {activeCommands.size > 0 && (
                      <motion.div
                        className="px-6 pb-4 flex gap-2 flex-wrap"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        {Array.from(activeCommands).map((commandId) => {
                          const command = commandOptions.find((cmd) => cmd.id === commandId)
                          if (!command) return null

                          return (
                            <motion.div
                              key={commandId}
                              className={cn(
                                "flex items-center gap-2 text-sm py-2 px-3 rounded-lg border",
                                commandId === "project-retrieval"
                                  ? "bg-blue-50 text-blue-800 border-blue-200"
                                  : "bg-green-50 text-green-800 border-green-200",
                              )}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                            >
                              {command.icon}
                              <span className="font-medium">{command.label}</span>
                              <button
                                onClick={() => removeActiveCommand(commandId)}
                                className={cn(
                                  "hover:text-red-500 transition-colors",
                                  commandId === "project-retrieval" ? "text-blue-600" : "text-green-600",
                                )}
                              >
                                <XIcon className="w-3 h-3" />
                              </button>
                            </motion.div>
                          )
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Attachments Display */}
                  <AnimatePresence>
                    {attachments.length > 0 && (
                      <motion.div
                        className="px-6 pb-4 flex gap-2 flex-wrap"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        {attachments.map((file, index) => (
                          <motion.div
                            key={index}
                            className="flex items-center gap-2 text-sm bg-green-50 text-green-800 py-2 px-3 rounded-lg border border-green-200"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                          >
                            <Paperclip className="w-3 h-3" />
                            <span className="font-medium">{file}</span>
                            <button
                              onClick={() => removeAttachment(index)}
                              className="text-green-600 hover:text-red-500 transition-colors"
                            >
                              <XIcon className="w-3 h-3" />
                            </button>
                          </motion.div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Enhanced Bottom Controls */}
                  <div className="px-6 pb-6 border-t border-gray-100 pt-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {!isProjectRetrievalMode && (
                        <motion.button
                          type="button"
                          data-upload-button
                          onClick={handleAttachFile}
                          whileTap={{ scale: 0.95 }}
                          className={cn(
                            "p-3 rounded-xl transition-all relative group",
                            showUploadDialog
                              ? "bg-green-100 text-green-700 shadow-sm border border-green-200"
                              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                          )}
                        >
                          <Paperclip className="w-5 h-5" />
                          <span className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            上传文件
                          </span>
                          {attachments.length > 0 && (
                            <motion.div
                              className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center bg-green-500"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            >
                              <span className="text-white text-xs font-bold">{attachments.length}</span>
                            </motion.div>
                          )}
                        </motion.button>
                      )}

                      <motion.button
                        type="button"
                        data-command-button
                        onClick={toggleCommandMenu}
                        whileTap={{ scale: 0.95 }}
                        className={cn(
                          "p-3 rounded-xl transition-all relative group",
                          showCommandMenu || activeCommands.size > 0
                            ? isProjectRetrievalMode
                              ? "bg-blue-100 text-blue-700 shadow-sm border border-blue-200"
                              : "bg-green-100 text-green-700 shadow-sm border border-green-200"
                            : "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
                        )}
                      >
                        <Command className="w-5 h-5" />
                        <span className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          命令菜单
                        </span>
                        {activeCommands.size > 0 && (
                          <motion.div
                            className={cn(
                              "absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center",
                              isProjectRetrievalMode ? "bg-blue-500" : "bg-green-500",
                            )}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          >
                            <span className="text-white text-xs font-bold">{activeCommands.size}</span>
                          </motion.div>
                        )}
                      </motion.button>
                    </div>

                    <motion.button
                      type="button"
                      onClick={handleSendMessage}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      disabled={!value.trim() || isWaitingResponse}
                      className={cn(
                        "px-6 py-3 rounded-xl text-sm font-medium transition-all",
                        "flex items-center gap-2 button-hover-effect",
                        value.trim() && !isWaitingResponse
                          ? isProjectRetrievalMode
                            ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
                            : "bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg shadow-green-500/25 hover:shadow-green-500/40"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed",
                      )}
                    >
                      <SendIcon className="w-4 h-4" />
                      <span>发送</span>
                    </motion.button>
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Enhanced Focus Effect */}
        {inputFocused && (
          <motion.div
            className="fixed w-[60rem] h-[60rem] rounded-full pointer-events-none z-0 opacity-[0.008] bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 blur-[120px]"
            animate={{
              x: mousePosition.x - 480,
              y: mousePosition.y - 480,
            }}
            transition={{
              type: "spring",
              damping: 30,
              stiffness: 100,
              mass: 0.8,
            }}
          />
        )}
      </div>
    </ProjectRetrievalModeContext.Provider>
  )
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3].map((dot) => (
        <motion.div
          key={dot}
          className="w-2 h-2 bg-gray-500 rounded-full"
          initial={{ opacity: 0.3 }}
          animate={{
            opacity: [0.3, 1, 0.3],
            scale: [0.8, 1.2, 0.8],
          }}
          transition={{
            duration: 1.4,
            repeat: Number.POSITIVE_INFINITY,
            delay: dot * 0.2,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  )
}
