// --- Imports ---
import { openaiConfig } from "https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2";

// --- DOM References ---
const chatWindow = document.getElementById('chat-window');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const modelPickerContainer = document.getElementById('model-picker-container');
const modelSelect = document.getElementById('model-select');
const alertContainer = document.getElementById('alert-container');
const themeToggle = document.getElementById('theme-toggle');

// --- API Keys ---

const GOOGLE_API_KEY = "AIzaSyDhTdzkM3G6g2DPIuagDI48YfKWGqZa27g";
const GOOGLE_CX_ID = "d299ddab769f84ff2";

// --- State Management ---
let llm;
let conversationHistory = [];
let isReActMode = false; // The CRITICAL switch for our logic
let typingIndicatorElement = null;

// --- STRATEGY 1: Native Tool Calling Schema (for OpenAI, Groq, etc.) ---
const nativeTools = [
    {
        type: "function",
        function: {
            name: "google_search",
            description: "Get information from the internet using Google Search.",
            parameters: {
                type: "object",
                properties: { query: { type: "string", description: "The search query." } },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "javascript_executor",
            description: "Executes a string of JavaScript code and returns the result. Use for calculations, data manipulation, or simple algorithms. The code runs in a sandboxed environment.",
            parameters: {
                type: "object",
                properties: { code: { type: "string", description: "The JavaScript code to execute. Must be a single expression or have a 'return' statement." } },
                required: ["code"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "api_requester",
            description:"Makes a POST request to a specified API endpoint with a JSON payload. The payload object is sent as the request body. Do not add parameters to the URL string itself.",
            parameters: {
                type: "object",
                properties: {
                    url: { type: "string", description: "The URL of the API endpoint to call." },
                    payload: { type: "object", description: "The JSON object to send as the request body." }
                },
                required: ["url", "payload"]
            }
        }
    }
];



// --- STRATEGY 2: ReAct System Prompt (for OpenRouter) ---
const reactSystemPrompt =`You are a helpful and conversational assistant. Your goal is to answer the user's question or fulfill their request.

First, consider if you can answer directly from your own knowledge. For simple greetings, questions, or conversations, you should respond naturally without using tools.

Only use a tool if the user's request requires it. Available tools are:
- google_search(query): For searching the web.
- javascript_executor(code): For running JavaScript code.
- api_requester(url, payload): For making POST requests to APIs.

To use a tool, you MUST respond with ONLY a JSON object inside a <tool_call> XML tag. For example:
<tool_call>
{
  "name": "javascript_executor",
  "arguments": {
    "code": "return 2 + 2;"
  }
}
</tool_call>

Do not add any other text or explanation outside of this tag if you decide to use a tool.`;
''
// --- UI Helper Functions (Unchanged) ---
// --- UI Helper Functions ---
// --- UI Helper Functions (Polished Version) ---

function showAlert(message, type = 'danger') {
    const alertElement = document.createElement('div');
    alertElement.className = `alert alert-${type} alert-dismissible fade show`;
    alertElement.role = 'alert';
    alertElement.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
    alertContainer.appendChild(alertElement);
    setTimeout(() => {
        alertElement.classList.remove('show');
        setTimeout(() => alertElement.remove(), 150);
    }, 5000);
}

function showTypingIndicator() {
    if (typingIndicatorElement) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'assistant-message-wrapper';
    wrapper.innerHTML = `<div class="avatar"><i class="bi bi-robot"></i></div><div class="message assistant-message typing-indicator"><span></span><span></span><span></span></div>`;
    typingIndicatorElement = wrapper;
    chatWindow.appendChild(typingIndicatorElement);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function hideTypingIndicator() {
    if (typingIndicatorElement) {
        typingIndicatorElement.remove();
        typingIndicatorElement = null;
    }
}

function addMessageToChat(role, content) {
    hideTypingIndicator();
    const messageContent = content || "";
    const wrapper = document.createElement('div');

    if (role === 'tool-request') {
        wrapper.className = 'tool-request-message is-collapsed';
        wrapper.innerHTML = `<div class="thought-content"><strong>Model Thought:</strong><pre class="mb-0"><code>${messageContent}</code></pre></div>`;
    } else {
        wrapper.className = `${role}-message-wrapper`;
        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}-message`;
        const avatar = `<div class="avatar"><i class="bi ${role === 'user' ? 'bi-person-fill' : 'bi-robot'}"></i></div>`;
        const jsonRegex = /^\s*[\{\[](.|\s)*[\}\]]\s*$/;

        if (jsonRegex.test(messageContent.trim())) {
            messageElement.innerHTML = `<div class="code-block-wrapper"><pre><code>${messageContent}</code></pre><button class="copy-code-btn">Copy</button></div>`;
        } else {
            messageElement.innerText = messageContent;
        }
        wrapper.innerHTML = avatar;
        wrapper.appendChild(messageElement);
    }
    
    chatWindow.appendChild(wrapper);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function disableForm() {
    messageInput.disabled = true;
    messageForm.querySelector("button").disabled = true;
    messageForm.querySelector("button").innerHTML = '<i class="bi bi-hourglass-split"></i>';
}

function enableForm() {
    messageInput.disabled = false;
    messageForm.querySelector('button').disabled = false;
    messageForm.querySelector('button').innerHTML = '<i class="bi bi-send-fill"></i>';
    messageInput.focus();
}

// --- Core Agent Logic (All functions are correct and up-to-date) ---

async function callLLM(messages) {
    const selectedModel = modelSelect.value;
    console.log(`Calling API with model: ${selectedModel} (ReAct Mode: ${isReActMode})`);
    const body = { model: selectedModel, messages: messages };
    if (!isReActMode) { body.tools = nativeTools; body.tool_choice = "auto"; }
    try {
        const response = await fetch(llm.baseUrl + "/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${llm.apiKey}` }, body: JSON.stringify(body) });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error.message || JSON.stringify(errorData)}`);
        }
        return (await response.json()).choices[0].message;
    } catch (error) {
        console.error("Error calling LLM:", error);
        showAlert(`LLM API Error: ${error.message}`);
        return { role: 'assistant', content: `Sorry, an error occurred. Please check the alert in the top right.` };
    }
}

async function executeGoogleSearch(query) {
    addMessageToChat("assistant", `Searching Google for "${query}"...`);
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX_ID}&q=${encodeURIComponent(query)}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Google Search API failed with status ${response.status}`);
        const data = await response.json();
        return data.items && data.items.length !== 0 ? data.items.slice(0, 3).map(item => item.snippet).join('\n---\n') : "No results found.";
    } catch (error) {
        console.error("Google Search failed:", error);
        showAlert(`Google Search failed: ${error.message}`);
        return `Error performing search. Please check the alert.`;
    }
}

async function executeJavaScript(code) {
    addMessageToChat("assistant", `Executing JavaScript:\n\`\`\`\n${code}\n\`\`\``);
    try {
        const codeToRun = code.includes('return') ? code : `return ${code}`;
        const result = new Function(codeToRun)();
        return JSON.stringify(result, null, 2) || 'null';
    } catch (error) {
        showAlert(`JavaScript Execution Error: ${error.message}`);
        return `Error executing code. Please check the alert.`;
    }
}

async function executeApiRequest(url, payload) {
    addMessageToChat("assistant", `Making API request to: ${url}`);
    try {
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
        const data = await response.json();
        return JSON.stringify(data, null, 2);
    } catch (error) {
        showAlert(`API Request Error: ${error.message}`);
        return `Error with API request. Please check the alert.`;
    }
}

async function runAgentLoop(userInput) {
    addMessageToChat('user', userInput);
    conversationHistory.push({ role: 'user', content: userInput });
    disableForm();
    showTypingIndicator(); // Show indicator when the loop starts

    let loopCount = 0;
    while (loopCount < 5) {
        loopCount++;
        const assistantMessage = await callLLM(conversationHistory);

        // --- NATIVE TOOL-CALLING LOGIC (With Simulated Thought Bubble) ---
        if (!isReActMode && assistantMessage.tool_calls) {
            
            // THE FIX: Manually create and display the thought bubble from the structured data.
            // We format the tool_calls array into a pretty JSON string.
            const formattedThought = JSON.stringify(assistantMessage.tool_calls, null, 2);
            addMessageToChat('tool-request', formattedThought);

            conversationHistory.push(assistantMessage);
            
            const toolPromises = assistantMessage.tool_calls.map(async (toolCall) => {
                const functionName = toolCall.function.name;
                const functionArgs = JSON.parse(toolCall.function.arguments);
                let toolResultContent;
                switch (functionName) {
                    case 'google_search': toolResultContent = await executeGoogleSearch(functionArgs.query); break;
                    case 'javascript_executor': toolResultContent = await executeJavaScript(functionArgs.code); break;
                    case 'api_requester': toolResultContent = await executeApiRequest(functionArgs.url, functionArgs.payload); break;
                    default: toolResultContent = `Error: Unknown tool '${functionName}'.`;
                }
                addMessageToChat('assistant', toolResultContent);
                return { role: "tool", tool_call_id: toolCall.id, name: functionName, content: toolResultContent };
            });

            const resolvedToolResults = await Promise.all(toolPromises);
            conversationHistory.push(...resolvedToolResults);
            showTypingIndicator(); // Show indicator while LLM processes results
            continue;
        
        // --- ReAct TEXT-BASED LOGIC (This part is already perfect) ---
        } else if (isReActMode && assistantMessage.content && assistantMessage.content.includes('<tool_call>')) {
            const toolCallMatch = assistantMessage.content.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
            if (toolCallMatch) {
                const jsonStr = toolCallMatch[1].trim();
                addMessageToChat('tool-request', jsonStr);
                conversationHistory.push(assistantMessage);
                try {
                    const toolCall = JSON.parse(jsonStr);
                    const toolName = toolCall.name;
                    const toolArgs = toolCall.arguments || toolCall;
                    let toolResultContent;
                    switch (toolName) {
                        case 'google_search': toolResultContent = await executeGoogleSearch(toolArgs.query); break;
                        case 'javascript_executor': toolResultContent = await executeJavaScript(toolArgs.code); break;
                        case 'api_requester': toolResultContent = await executeApiRequest(toolArgs.url, toolArgs.payload); break;
                        default: toolResultContent = `Error: An unknown tool named '${toolName}'.`;
                    }
                    addMessageToChat('assistant', toolResultContent);
                    conversationHistory.push({ role: "user", content: `<tool_result>${toolResultContent}</tool_result>` });
                    showTypingIndicator(); // Show indicator while LLM processes results
                    continue;
                } catch (e) {
                    const errorFeedback = `Error parsing tool call: ${e.message}`;
                    conversationHistory.push({ role: "user", content: `<tool_result>${errorFeedback}</tool_result>` });
                    continue;
                }
            }
        
        // --- NO TOOL CALL or FAILED LLM CALL ---
        } else {
            addMessageToChat('assistant', assistantMessage.content);
            conversationHistory.push(assistantMessage);
            break;
        }
    }

    if (loopCount >= 5) {
        addMessageToChat('assistant', "I seem to be stuck in a thinking loop. Please try a different question.");
    }
    
    hideTypingIndicator(); // Hide indicator at the end of the turn
    enableForm();
}

// --- Event Listeners ---
messageForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const userInput = messageInput.value.trim();
    if (!userInput) return;
    messageInput.value = '';
    showTypingIndicator();
    await runAgentLoop(userInput);
});

chatWindow.addEventListener('click', (event) => {
    const thoughtBubble = event.target.closest('.tool-request-message');
    if (thoughtBubble) {
        thoughtBubble.classList.toggle('is-collapsed');
        return;
    }
    const copyBtn = event.target.closest('.copy-code-btn');
    if (copyBtn) {
        const code = copyBtn.closest('.code-block-wrapper').querySelector('code').innerText;
        navigator.clipboard.writeText(code).then(() => {
            copyBtn.innerText = 'Copied!';
            setTimeout(() => { copyBtn.innerText = 'Copy'; }, 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showAlert('Failed to copy code.', 'warning');
        });
    }
});

themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-bs-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-bs-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    themeToggle.innerHTML = newTheme === 'dark' ? '<i class="bi bi-sun-fill"></i>' : '<i class="bi bi-moon-stars-fill"></i>';
});

// --- Initial Setup ---
async function initializeApp() {
    try {
        llm = await openaiConfig({ baseUrls: [{ name: "AI Pipe (Custom)", url: "https://aipipe.org/openai/v1" }, { name: "Groq", url: "https://api.groq.com/openai/v1" }, { name: "OpenRouter", url: "https://openrouter.ai/api/v1" }, { name: "OpenAI", url: "https://api.openai.com/v1" }], help: '<div class="alert alert-info">Select your provider, then enter your API key.</div>' });
        conversationHistory = [];
        if (llm.baseUrl.includes("openrouter.ai")) {
            console.log("OpenRouter detected. Switching to ReAct mode for tool calls.");
            isReActMode = true;
            conversationHistory.push({ role: 'system', content: reactSystemPrompt });
        } else {
            console.log("Standard provider detected. Using native tool calling.");
            isReActMode = false;
        }
        if (llm.models && llm.models.length > 0) {
            modelSelect.innerHTML = "";
            llm.models.forEach(model => { const option = document.createElement("option"); option.value = model; option.innerText = model; modelSelect.appendChild(option); });
            const preferredModels = ['gpt-4o-mini', 'llama3-8b-8192', 'mistralai/mistral-7b-instruct'];
            for (const preferred of preferredModels) { if (llm.models.includes(preferred)) { modelSelect.value = preferred; break; } }
            modelPickerContainer.style.display = 'block';
        }
        addMessageToChat('assistant', 'Hello! Your LLM is configured. How can I help you?');
        enableForm();
    } catch (error) {
        console.error("Configuration failed:", error);
        showAlert(`Configuration failed: ${error.message}`, "danger");
    }
}

// Load theme from localStorage
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-bs-theme', savedTheme);
themeToggle.innerHTML = savedTheme === 'dark' ? '<i class="bi bi-sun-fill"></i>' : '<i class="bi bi-moon-stars-fill"></i>';

disableForm();
initializeApp();
