"use client"

import { useEffect, useRef, useCallback, useTransition } from "react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  Paperclip,
  Command,
  SendIcon,
  XIcon,
  LoaderIcon,
  Sparkles,
  User,
  Bot,
  Upload,
  Check,
  Code,
  Eye,
  Maximize2,
  Minimize2,
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

interface CodeBlock {
  language: string
  content: string
  title?: string
  isProjectRetrieval?: boolean // 添加模式标识
}

interface Message {
  id: string
  content: string
  role: "user" | "assistant"
  timestamp: Date
  codeBlocks?: CodeBlock[]
  isProjectRetrieval?: boolean // 添加模式标识
}

interface FileUpload {
  name: string
  size: string
  type: string
  file: File  // 添加实际文件对象
}

interface ArtifactData {
  id: string
  title: string
  language: string
  content: string
  messageId: string
  isProjectRetrieval?: boolean
}

const ProjectRetrievalModeContext = React.createContext(false)

interface CodeProps extends ComponentPropsWithoutRef<'code'> {
  inline?: boolean;
  className?: string;
  node?: any;
}

export function AnimatedAIChat() {
  const [value, setValue] = useState("")
  const [attachments, setAttachments] = useState<string[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<FileUpload[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])  // 新增：保存已确认的文件对象
  const [isPending, startTransition] = useTransition()
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [messages, setMessages] = useState<Message[]>([])
  const [hasStartedChat, setHasStartedChat] = useState(false)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [showArtifacts, setShowArtifacts] = useState(false)
  const [currentArtifact, setCurrentArtifact] = useState<ArtifactData | null>(null)
  const [artifactMode, setArtifactMode] = useState<"preview" | "code">("preview")
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [inputFocused, setInputFocused] = useState(false)
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true)

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
  const artifactsContainerRef = useRef<HTMLDivElement>(null)

  const chatService = useRef(new ChatService()).current;
  const [currentResponse, setCurrentResponse] = useState<string>('');

  const commandOptions: CommandOption[] = [
    {
      id: "report",
      icon: <Sparkles className="w-4 h-4" />,
      label: "报告撰写",
      description: "生成专业报告文档",
      prefix: "/report",
    },
    {
      id: "project-retrieval",
      icon: <Code className="w-4 h-4" />,
      label: "项目检索",
      description: "检索和查看项目数据",
      prefix: "/project",
    },
  ]

  // 获取当前激活的 agentId
  const getCurrentAgentId = useCallback(() => {
    if (activeCommands.has('report')) {
      return settings.AGENT_UUIDS.REPORT_WRITING;
    } else if (activeCommands.has('project-retrieval')) {
      return settings.AGENT_UUIDS.PROJECT_RECOMMEND;
    }
    return settings.AGENT_UUIDS.NORMAL_QA;
  }, [activeCommands]);

  // 更新 ChatService 的 agentId
  useEffect(() => {
    const agentId = getCurrentAgentId();
    chatService.updateAgentId(agentId);
  }, [activeCommands, getCurrentAgentId]);

  // Parse code blocks from message content
  const parseCodeBlocks = (
    content: string,
    isProjectRetrieval = false,
  ): { content: string; codeBlocks: CodeBlock[] } => {
    const codeBlockRegex = /```(\w+)(?:\s+title="([^"]*)")?\s*\n([\s\S]*?)\n```/g
    const codeBlocks: CodeBlock[] = []
    let match

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const [fullMatch, language, title, code] = match
      codeBlocks.push({
        language,
        content: code.trim(),
        title: title || getDefaultTitle(language),
        isProjectRetrieval, // 传递模式标识
      })
    }

    const cleanContent = content.replace(codeBlockRegex, "").trim()
    return { content: cleanContent, codeBlocks }
  }

  const getDefaultTitle = (language: string): string => {
    const titles: Record<string, string> = {
      report: "报告文档",
      markdown: "Markdown 文档",
      latex: "LaTeX 文档",
      json: "JSON 数据",
      javascript: "JavaScript 代码",
      typescript: "TypeScript 代码",
      python: "Python 代码",
      html: "HTML 文档",
      css: "CSS 样式",
      table: "数据表格",
    }
    return titles[language] || `${language.toUpperCase()} 文档`
  }

  const createArtifact = (codeBlock: CodeBlock, messageId: string): ArtifactData => {
    return {
      id: `artifact-${Date.now()}`,
      title: codeBlock.title || getDefaultTitle(codeBlock.language),
      language: codeBlock.language,
      content: codeBlock.content,
      messageId,
      isProjectRetrieval: codeBlock.isProjectRetrieval, // 使用CodeBlock的模式标识
    }
  }

  const renderMarkdown = (content: string): string => {
    return content
      .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-200">$1</h1>')
      .replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold text-gray-800 mb-4 mt-8">$1</h2>')
      .replace(/^### (.*$)/gm, '<h3 class="text-lg font-medium text-gray-700 mb-3 mt-6">$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic text-gray-700">$1</em>')
      .replace(/^- (.*$)/gm, '<li class="ml-6 mb-2 text-gray-700">$1</li>')
      .replace(/^\d+\. (.*$)/gm, '<li class="ml-6 mb-2 text-gray-700">$1</li>')
      .replace(/\n\n/g, '</p><p class="mb-4 text-gray-700 leading-relaxed">')
      .replace(/\n/g, "<br>")
      .replace(/^(.*)$/gm, '<p class="mb-4 text-gray-700 leading-relaxed">$1</p>')
  }

  const handleCopyMessage = async (message: Message) => {
    const fullContent =
      message.content +
      (message.codeBlocks
        ? "\n\n" + message.codeBlocks.map((block) => `\`\`\`${block.language}\n${block.content}\n\`\`\``).join("\n\n")
        : "")

    try {
      await navigator.clipboard.writeText(fullContent)
      setCopiedMessageId(message.id)
      setTimeout(() => setCopiedMessageId(null), 2000)
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

      // 如果取消的是项目检索，且当前显示的是项目检索相关的Artifacts，则隐藏
      if (commandId === "project-retrieval" && currentArtifact?.isProjectRetrieval) {
        setShowArtifacts(false)
        setCurrentArtifact(null)
        setShouldScrollToBottom(true)
      }

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

  // Only scroll to bottom when new messages are added and shouldScrollToBottom is true
  useEffect(() => {
    if (chatContainerRef.current && shouldScrollToBottom) {
      const scrollContainer = chatContainerRef.current
      const isNearBottom =
        scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 100

      if (isNearBottom || messages.length === 1) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [messages, shouldScrollToBottom])

  // Disable auto-scroll when artifacts are shown
  useEffect(() => {
    setShouldScrollToBottom(!showArtifacts)
  }, [showArtifacts])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (value.trim()) {
        handleSendMessage()
      }
    }
  }

  const handleSendMessage = async () => {
    if (value.trim()) {
      const isProjectRetrievalActive = activeCommands.has("project-retrieval")

      const userMessage: Message = {
        id: `msg-${performance.now().toString().replace('.', '')}`,
        content: value.trim(),
        role: "user",
        timestamp: new Date(),
        isProjectRetrieval: isProjectRetrievalActive,
      }

      setMessages((prev) => [...prev, userMessage])
      setHasStartedChat(true)
      setValue("")
      setCurrentResponse('')

      // Reset input field state
      setTimeout(() => {
        adjustHeight(true)
        setInputFocused(false)
        setActiveCommands(new Set())
      }, 0)

      // 使用已确认的文件列表
      const filesToUpload = [...selectedFiles]
      setSelectedFiles([])  // 清空已选文件
      setAttachments([])    // 清空附件显示

      // Re-enable auto-scroll for new messages
      setShouldScrollToBottom(true)

      startTransition(() => {
        // 创建初始占位消息
        const tempMessageId = `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        setMessages(prev => [
          ...prev,
          {
            id: tempMessageId,
            content: "",
            role: "assistant",
            timestamp: new Date(),
            codeBlocks: [],
            isProjectRetrieval: isProjectRetrievalActive
          }
        ]);

        // 调用聊天服务，传入已确认的文件
        chatService.chatStream(value.trim(), activeCommands, filesToUpload)
          .then(async (stream) => {
            const reader = stream.getReader()
            const decoder = new TextDecoder()
            let accumulatedContent = ''
            let buffer = '' // 用于存储不完整的数据

            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              const chunk = decoder.decode(value)
              buffer += chunk // 将新数据添加到缓冲区

              // 按行分割并处理完整的数据行
              const lines = buffer.split('\n')
              buffer = lines.pop() || '' // 保留最后一个可能不完整的行

              for (const line of lines) {
                if (line.startsWith('data:')) {
                  try {
                    const jsonStr = line.slice(5).trim()
                    if (jsonStr) {
                      const data = JSON.parse(jsonStr) as ChatStreamResponse
                      if (data.content) {
                        accumulatedContent += data.content
                        // 更新占位消息的内容
                        setMessages(prev => 
                          prev.map(msg => 
                            msg.id === tempMessageId
                              ? { ...msg, content: accumulatedContent }
                              : msg
                          )
                        )
                      }

                      // 保存 chatId 到聊天状态
                      if (data.chatId) {
                        const agentId = getCurrentAgentId()
                        const chatState = chatService.getChatState(agentId)
                        chatState.chatId = data.chatId
                      }

                      if (data.finish) {
                        const { content, codeBlocks } = parseCodeBlocks(accumulatedContent, isProjectRetrievalActive)
                        
                        // 一次性更新最终消息
                        setMessages(prev => 
                          prev.map(msg => 
                            msg.id === tempMessageId
                              ? {
                                  ...msg,
                                  content,
                                  codeBlocks,
                                  timestamp: new Date()
                                }
                              : msg
                          )
                        )

                        if (codeBlocks.length > 0) {
                          const artifact = createArtifact(codeBlocks[0], tempMessageId)
                          setCurrentArtifact(artifact)
                          setShowArtifacts(true)
                          setArtifactMode("preview")
                        }

                        setCurrentResponse('')
                      }
                    }
                  } catch (error) {
                    console.error('解析 SSE 数据失败:', error, '原始数据:', line)
                  }
                }
              }
            }
          })
          .catch(error => {
            console.error('Chat error:', error)
            setCurrentResponse('')
            // 移除占位消息
            setMessages(prev => prev.filter(msg => msg.id !== tempMessageId))
          })
      })
    }
  }

  const handleAttachFile = () => {
    setShowUploadDialog(true)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const newFiles: FileUpload[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fileSizeInKB = Math.round(file.size / 1024)
        const fileSizeStr = fileSizeInKB < 1024 ? `${fileSizeInKB} KB` : `${(fileSizeInKB / 1024).toFixed(1)} MB`
        
        // 验证文件大小
        const MAX_SIZE = 10 * 1024 * 1024 // 10MB
        if (file.size > MAX_SIZE) {
          alert(`文件 ${file.name} 大小超过10MB限制`)
          continue
        }

        newFiles.push({
          name: file.name,
          size: fileSizeStr,
          type: file.type,
          file: file  // 保存实际文件对象
        })
      }
      setUploadedFiles([...uploadedFiles, ...newFiles])
    }
  }

  const confirmFileUpload = () => {
    // 保存实际文件对象
    const newFiles = uploadedFiles.map(f => f.file)
    setSelectedFiles(prev => [...prev, ...newFiles])
    
    // 更新显示用的附件列表
    const newAttachments = uploadedFiles.map((file) => file.name)
    setAttachments([...attachments, ...newAttachments])
    
    setUploadedFiles([])
    setShowUploadDialog(false)
  }

  const removeAttachment = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))  // 同时移除实际文件
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const handleArtifactToggle = (artifact: ArtifactData) => {
    if (currentArtifact?.messageId === artifact.messageId && showArtifacts) {
      setShowArtifacts(false)
      setCurrentArtifact(null)
      setShouldScrollToBottom(true)
    } else {
      setCurrentArtifact(artifact)
      setShowArtifacts(true)
      setArtifactMode("preview")
      setShouldScrollToBottom(false)
    }
  }

  const handleInputFocus = () => {
    setInputFocused(true)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    setValue(newValue)

    // Use requestAnimationFrame for smoother height adjustment
    requestAnimationFrame(() => {
      adjustHeight()
    })
  }

  const isProjectRetrievalMode = activeCommands.has("project-retrieval")

  const renderTable = (content: string, isProjectRetrieval = false): string => {
    const lines = content
      .trim()
      .split("\n")
      .filter((line) => line.trim())
    if (lines.length < 2) return content

    const headers = lines[0]
      .split("|")
      .map((h) => h.trim())
      .filter((h) => h)
    const rows = lines.slice(2).map((line) =>
      line
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell) => cell),
    )

    const themeClasses = isProjectRetrieval
      ? {
          border: "border-blue-300",
          headerBg: "bg-blue-50",
          headerText: "text-blue-900",
          cellBorder: "border-blue-200",
          hoverBg: "hover:bg-blue-50/50",
        }
      : {
          border: "border-green-300",
          headerBg: "bg-green-50",
          headerText: "text-green-900",
          cellBorder: "border-green-200",
          hoverBg: "hover:bg-green-50/50",
        }

    return `
    <div class="overflow-auto max-h-[70vh] max-w-full">
      <table class="w-full border-collapse border ${themeClasses.border} rounded-lg overflow-hidden min-w-max">
        <thead class="${themeClasses.headerBg} sticky top-0">
          <tr>
            ${headers
              .map(
                (header) =>
                  `<th class="border ${themeClasses.cellBorder} px-4 py-3 text-left font-semibold ${themeClasses.headerText} whitespace-nowrap">${header}</th>`,
              )
              .join("")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) =>
                `<tr class="${themeClasses.hoverBg} transition-colors">
              ${row.map((cell) => `<td class="border ${themeClasses.cellBorder} px-4 py-3 text-gray-700 whitespace-nowrap">${cell}</td>`).join("")}
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `
  }

  const renderMessageContent = (message: Message) => {
    if (message.role === "user") {
      return <div className="text-white">{message.content}</div>;
    }

    const components: Components = {
      code({ node, inline, className, children, ...props }: CodeProps) {
        if (inline) {
          return (
            <code className="bg-gray-100 rounded px-1 text-gray-800" {...props}>
              {children}
            </code>
          );
        }

        const match = /language-(\w+)/.exec(className || "");
        const language = match ? match[1] : "";
        const content = String(children).trim();
        
        // 创建代码块对象
        const codeBlock: CodeBlock = {
          language,
          content,
          title: language ? getDefaultTitle(language) : "Code",
          isProjectRetrieval: message.isProjectRetrieval,
        };

        // 更新消息的代码块列表
        if (!message.codeBlocks) {
          message.codeBlocks = [];
        }
        const existingIndex = message.codeBlocks.findIndex(
          (cb) => cb.content === content && cb.language === language
        );
        if (existingIndex === -1) {
          message.codeBlocks.push(codeBlock);
        }

        const artifact = createArtifact(codeBlock, message.id);
        return (
          <div className="my-4">
            <motion.button
              onClick={() => handleArtifactToggle(artifact)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
                message.isProjectRetrieval
                  ? "bg-blue-100 text-blue-800 hover:bg-blue-200"
                  : "bg-green-100 text-green-800 hover:bg-green-200"
              )}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Code className="w-4 h-4" />
              <span>查看 {codeBlock.title}</span>
            </motion.button>
          </div>
        );
      },
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
      table: (props: ComponentPropsWithoutRef<'table'>) => (
        <div className="overflow-auto max-h-[70vh] max-w-full">
          <table className="w-full border-collapse border border-gray-300 rounded-lg overflow-hidden min-w-max" {...props} />
        </div>
      ),
      thead: (props: ComponentPropsWithoutRef<'thead'>) => (
        <thead className="bg-gray-50 sticky top-0" {...props} />
      ),
      tbody: (props: ComponentPropsWithoutRef<'tbody'>) => (
        <tbody {...props} />
      ),
      tr: (props: ComponentPropsWithoutRef<'tr'>) => (
        <tr className="hover:bg-gray-50 transition-colors" {...props} />
      ),
      th: (props: ComponentPropsWithoutRef<'th'>) => (
        <th className="border border-gray-200 px-4 py-3 text-left font-semibold text-gray-900 whitespace-nowrap" {...props} />
      ),
      td: (props: ComponentPropsWithoutRef<'td'>) => (
        <td className="border border-gray-200 px-4 py-3 text-gray-700 whitespace-nowrap" {...props} />
      ),
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
              width: showArtifacts ? "50%" : "100%",
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

                            {/* Enhanced Code Block Preview Cards */}
                            {message.codeBlocks && message.codeBlocks.length > 0 && (
                              <div className="space-y-3">
                                {message.codeBlocks.map((codeBlock, blockIndex) => {
                                  const artifact = createArtifact(codeBlock, message.id)
                                  const isActive = currentArtifact?.messageId === message.id && showArtifacts
                                  const isProjectRetrievalBlock = codeBlock.isProjectRetrieval

                                  return (
                                    <motion.button
                                      key={blockIndex}
                                      onClick={() => handleArtifactToggle(artifact)}
                                      className={cn(
                                        "flex items-center gap-4 p-4 rounded-xl transition-all text-left w-full group shadow-sm border",
                                        isActive
                                          ? isProjectRetrievalBlock
                                            ? "bg-blue-50 border-blue-300 shadow-md"
                                            : "bg-green-50 border-green-300 shadow-md"
                                          : isProjectRetrievalBlock
                                            ? "bg-white border-blue-200 hover:border-blue-300 hover:bg-blue-50/30"
                                            : "bg-white border-gray-200 hover:border-green-300 hover:bg-green-50/30",
                                      )}
                                      whileHover={{ scale: 1.01, y: -1 }}
                                      whileTap={{ scale: 0.99 }}
                                    >
                                      <div
                                        className={cn(
                                          "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm",
                                          isActive
                                            ? isProjectRetrievalBlock
                                              ? "bg-gradient-to-br from-blue-200 to-blue-300"
                                              : "bg-gradient-to-br from-green-200 to-green-300"
                                            : isProjectRetrievalBlock
                                              ? "bg-gradient-to-br from-blue-100 to-blue-200"
                                              : "bg-gradient-to-br from-green-100 to-green-200",
                                        )}
                                      >
                                        <Code
                                          className={cn(
                                            "w-6 h-6",
                                            isProjectRetrievalBlock ? "text-blue-700" : "text-green-700",
                                          )}
                                        />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-gray-900 text-sm mb-1">
                                          {codeBlock.title}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          点击查看 {codeBlock.language.toUpperCase()} 内容
                                        </div>
                                      </div>
                                      <div
                                        className={cn(
                                          "flex items-center gap-1 text-xs transition-colors",
                                          isActive
                                            ? isProjectRetrievalBlock
                                              ? "text-blue-600"
                                              : "text-green-600"
                                            : isProjectRetrievalBlock
                                              ? "text-gray-400 group-hover:text-blue-600"
                                              : "text-gray-400 group-hover:text-green-600",
                                        )}
                                      >
                                        {isActive ? (
                                          <Minimize2 className="w-4 h-4" />
                                        ) : (
                                          <Maximize2 className="w-4 h-4" />
                                        )}
                                      </div>
                                    </motion.button>
                                  )
                                })}
                              </div>
                            )}

                            {/* Enhanced Copy Button */}
                            {message.role === "assistant" && (
                              <motion.button
                                onClick={() => handleCopyMessage(message)}
                                className="self-start flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                {copiedMessageId === message.id ? (
                                  <div
                                    className={cn(
                                      "flex items-center gap-2",
                                      message.isProjectRetrieval ? "text-blue-600" : "text-green-600",
                                    )}
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>已复制</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Copy className="w-3 h-3" />
                                    <span>复制</span>
                                  </div>
                                )}
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
                                onClick={() => selectCommand(option.id)}
                                className={cn(
                                  "flex items-center gap-3 px-3 py-3 text-sm transition-all cursor-pointer w-full rounded-lg",
                                  isActive
                                    ? option.id === "project-retrieval"
                                      ? "bg-blue-100 text-blue-800 border border-blue-200"
                                      : "bg-green-100 text-green-800 border border-green-200"
                                    : "text-gray-700 hover:bg-gray-50",
                                )}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.99 }}
                              >
                                <div
                                  className={cn(
                                    "w-6 h-6 flex items-center justify-center rounded",
                                    isActive
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
                                    isActive
                                      ? option.id === "project-retrieval"
                                        ? "bg-blue-200 text-blue-800"
                                        : "bg-green-200 text-green-800"
                                      : "bg-gray-100 text-gray-400",
                                  )}
                                >
                                  {option.prefix}
                                </div>
                                {isActive && (
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
                              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                              取消
                            </button>
                            <button
                              onClick={confirmFileUpload}
                              disabled={uploadedFiles.length === 0}
                              className={cn(
                                "px-4 py-2 text-sm rounded-lg transition-all flex items-center gap-2",
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
                            className="flex items-center gap-2 text-sm bg-blue-50 text-blue-800 py-2 px-3 rounded-lg border border-blue-200"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                          >
                            <Paperclip className="w-3 h-3" />
                            <span className="font-medium">{file}</span>
                            <button
                              onClick={() => removeAttachment(index)}
                              className="text-blue-600 hover:text-red-500 transition-colors"
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
                          className="p-3 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all relative group"
                        >
                          <Paperclip className="w-5 h-5" />
                          <span className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            上传文件
                          </span>
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
                      disabled={!value.trim()}
                      className={cn(
                        "px-6 py-3 rounded-xl text-sm font-medium transition-all",
                        "flex items-center gap-2 button-hover-effect",
                        value.trim()
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

          {/* Enhanced Artifacts Panel */}
          <AnimatePresence>
            {showArtifacts && currentArtifact && (
              <motion.div
                className="w-1/2 border-l border-gray-200 bg-white flex flex-col h-full"
                initial={{ x: "100%", opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: "100%", opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              >
                {/* Enhanced Artifacts Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white backdrop-blur-sm">
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center shadow-sm border",
                        currentArtifact.isProjectRetrieval
                          ? "bg-gradient-to-br from-blue-100 to-blue-200 border-blue-200/50"
                          : "bg-gradient-to-br from-green-100 to-green-200 border-green-200/50",
                      )}
                    >
                      <Code
                        className={cn(
                          "w-6 h-6",
                          currentArtifact.isProjectRetrieval ? "text-blue-700" : "text-green-700",
                        )}
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-base">{currentArtifact.title}</h3>
                      <p className="text-sm text-gray-600">{currentArtifact.language.toUpperCase()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
                      <button
                        onClick={() => setArtifactMode("preview")}
                        className={cn(
                          "px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2",
                          artifactMode === "preview"
                            ? currentArtifact.isProjectRetrieval
                              ? "bg-blue-500 text-white shadow-sm"
                              : "bg-green-500 text-white shadow-sm"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50",
                        )}
                      >
                        <Eye className="w-4 h-4" />
                        预览
                      </button>
                      <button
                        onClick={() => setArtifactMode("code")}
                        className={cn(
                          "px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2",
                          artifactMode === "code"
                            ? currentArtifact.isProjectRetrieval
                              ? "bg-blue-500 text-white shadow-sm"
                              : "bg-green-500 text-white shadow-sm"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50",
                        )}
                      >
                        <Code className="w-4 h-4" />
                        代码
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setShowArtifacts(false)
                        setShouldScrollToBottom(true)
                      }}
                      className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors hover:bg-gray-100"
                    >
                      <XIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Enhanced Artifacts Content */}
                <div className="flex-1 overflow-hidden">
                  {artifactMode === "preview" ? (
                    // Preview Mode
                    currentArtifact.language === "table" ? (
                      <div
                        className={cn(
                          "h-full overflow-hidden p-8",
                          currentArtifact.isProjectRetrieval
                            ? "scrollbar-thin scrollbar-thumb-blue-300 scrollbar-track-transparent"
                            : "scrollbar-thin scrollbar-thumb-green-300 scrollbar-track-transparent",
                        )}
                        dangerouslySetInnerHTML={{
                          __html: renderTable(currentArtifact.content, currentArtifact.isProjectRetrieval),
                        }}
                      />
                    ) : currentArtifact.language === "report" || currentArtifact.language === "markdown" ? (
                      <div
                        ref={artifactsContainerRef}
                        className="h-full overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
                        style={{ scrollBehavior: "smooth" }}
                      >
                        <div
                          className="prose prose-sm max-w-none text-gray-800 leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(currentArtifact.content) }}
                        />
                      </div>
                    ) : (
                      <div
                        className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
                        style={{ scrollBehavior: "smooth" }}
                      >
                        <pre className="p-8 text-sm text-gray-800 font-mono whitespace-pre-wrap bg-gray-50 h-full leading-relaxed">
                          {currentArtifact.content}
                        </pre>
                      </div>
                    )
                  ) : (
                    // Code Mode - Show raw source code
                    <div
                      className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
                      style={{ scrollBehavior: "smooth" }}
                    >
                      <pre className="p-8 text-sm text-gray-800 font-mono whitespace-pre-wrap bg-gray-50 h-full leading-relaxed">
                        {`\`\`\`${currentArtifact.language}${currentArtifact.title ? ` title="${currentArtifact.title}"` : ""}\n${currentArtifact.content}\n\`\`\``}
                      </pre>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
