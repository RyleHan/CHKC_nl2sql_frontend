import { chatWithAgent } from './agentApi.js'; // Added import

document.addEventListener('DOMContentLoaded', () => {
    const userInput = document.getElementById('userInput');
    const searchButton = document.getElementById('searchButton');
    const dimensionsDisplay = document.getElementById('dimensionsDisplay');
    const resultsList = document.getElementById('resultsList');
    
    // Modal elements (will be properly initialized later)
    let projectModal, closeModalButton, modalContentElement;

    let currentDimensions = [];
    let currentProjects = []; // To store the full list of projects from the agent

    // --- Event Listeners ---
    searchButton.addEventListener('click', handleSearch);

    // --- Functions ---

    async function handleSearch() {
        const query = userInput.value;
        if (!query) {
            alert('请输入您的需求！');
            return;
        }

        try {
            const agentResponse = await chatWithAgent(query);
            console.log('Agent Response:', agentResponse);

            if (agentResponse && agentResponse.choices && agentResponse.choices.length > 1 && agentResponse.choices[1].content) {
                let jsonString = agentResponse.choices[1].content;
                // Remove markdown code block fences if they are still present (just in case)
                if (jsonString.startsWith("```json")) {
                    jsonString = jsonString.substring(7); 
                }
                if (jsonString.endsWith("```")) {
                    jsonString = jsonString.substring(0, jsonString.length - 3);
                }
                jsonString = jsonString.trim();

                try {
                    const parsedAgentData = JSON.parse(jsonString);
                    console.log('Parsed Agent Data:', parsedAgentData);

                    if (parsedAgentData && parsedAgentData.extracted_dimensions) {
                        currentDimensions = parsedAgentData.extracted_dimensions;
                    } else {
                        alert('从Agent获取的维度信息JSON结构不符合预期 (缺少extracted_dimensions)。');
                        currentDimensions = [];
                    }

                    if (parsedAgentData && parsedAgentData.projects) {
                        currentProjects = parsedAgentData.projects; // Store the full projects array
                    } else {
                        alert('从Agent获取的项目列表JSON结构不符合预期 (缺少projects)。');
                        currentProjects = [];
                    }

                } catch (e) {
                    alert('解析Agent返回的JSON时出错 (choices[1].content)。');
                    console.error('Error parsing JSON from agent:', e);
                    console.log('Original JSON string from agent:', jsonString);
                    currentDimensions = [];
                    currentProjects = [];
                }
            } else {
                alert('从Agent获取数据失败或格式不符 (未找到choices[1].content)。');
                currentDimensions = [];
                currentProjects = [];
            }

        } catch (error) {
            console.error('Error calling agent API:', error);
            alert('调用Agent API时出错: ' + error.message);
            currentDimensions = [];
            currentProjects = [];
        }
        
        renderDimensions();
        renderResults(currentProjects); // Pass the full projects array
    }

    function renderDimensions() {
        dimensionsDisplay.innerHTML = ''; // Clear previous dimensions
        if (currentDimensions.length === 0) {
            dimensionsDisplay.innerHTML = '<p>未提取到维度信息。</p>';
            return;
        }

        currentDimensions.forEach((dim, index) => {
            const dimElement = document.createElement('div');
            dimElement.classList.add('dimension-item');

            const dimText = `${dim.field_name}: ${dim.operator} ${dim.field_value}`;
            const span = document.createElement('span');
            span.textContent = dimText;
            span.title = '点击编辑'; // Tooltip
            span.addEventListener('click', () => editDimension(index));

            dimElement.appendChild(span);
            dimensionsDisplay.appendChild(dimElement);
        });
    }

    function editDimension(index) {
        const dimension = currentDimensions[index];
        const newValue = prompt(`编辑 "${dimension.field_name}":`, `${dimension.operator} ${dimension.field_value}`);

        if (newValue !== null && newValue.trim() !== '') {
            const parts = newValue.trim().split(' ');
            let operator = '=';
            let value = newValue.trim();

            if (parts.length > 1) {
                const potentialOperator = parts[0];
                if (['=', '>', '<', '>=', '<=', '!='].includes(potentialOperator)) {
                    operator = potentialOperator;
                    value = parts.slice(1).join(' ');
                }
            }
            
            currentDimensions[index].field_value = isNaN(parseFloat(value)) ? value : parseFloat(value);
            currentDimensions[index].operator = operator;

            renderDimensions();

            console.log('Updated dimensions to send to backend:', currentDimensions);
            alert('维度已更新，请重新搜索以应用更改。');
            // Potentially re-trigger search or inform user to do so
        }
    }
    
    // Removed mockInitialResults and mockMoreResults as they are no longer needed

    function renderResults(projects) {
        resultsList.innerHTML = ''; // Clear previous results
        if (!projects || projects.length === 0) {
            resultsList.innerHTML = '<p>没有找到符合条件的项目。</p>';
            return;
        }

        projects.forEach((project, index) => {
            const item = document.createElement('div');
            item.classList.add('result-item');

            const nameSpan = document.createElement('span');
            nameSpan.textContent = project["项目名称"] || "未命名项目"; 

            const button = document.createElement('button');
            button.textContent = '查看详情';
            button.dataset.projectIndex = index; // Store index to access full project data from currentProjects
            button.addEventListener('click', handleShowDetails);

            item.appendChild(nameSpan);
            item.appendChild(button);
            resultsList.appendChild(item);
        });
    }

    function handleShowDetails(event) {
        const projectIndex = event.target.dataset.projectIndex;
        const project = currentProjects[projectIndex]; // Get the full project object
        if (project) {
            // Logic to show modal will go here
            console.log('Show details for:', project); 
            alert(`详情 (将在模态框中显示):\n名称: ${project["项目名称"] || "N/A"}\n` + 
                  Object.entries(project).filter(([key]) => key !== '项目名称' && key !== 'name')
                  .map(([key, value]) => `${key}: ${value}`).join('\n')
                 );
            // showProjectDetailsModal(project); // This will be the actual call later
        }
    }

    // Initial call to render some placeholder if needed, or leave blank until search
    renderDimensions(); 
}); 
// Removed parseProjectsFromAgentText as it's no longer needed (ensure no trailing braces from it) 