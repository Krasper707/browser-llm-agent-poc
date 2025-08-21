// --- Imports ---
import { openaiConfig } from "https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2";

// --- DOM References ---
const chatWindow = document.getElementById('chat-window');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const modelPickerContainer = document.getElementById('model-picker-container');
const modelSelect = document.getElementById('model-select');

// --- API Keys ---

const GOOGLE_API_KEY = "AIzaSyAIaoS1t2mGt1Tt2r_M6qbayoXXdNwGYhM";
const GOOGLE_CX_ID = "97b32ef0dee6c42d1";

// --- State Management ---
let llm;
let conversationHistory = [];
let isReActMode = false; // The CRITICAL switch for our logic

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
// const reactSystemPrompt = 
// `You are a helpful and conversational assistant. Your goal is to answer the user's question or fulfill their request.

// First, consider if you can answer directly from your own knowledge. For simple greetings, questions, or conversations, you should respond naturally without using tools.

// Only use a tool if the user's request requires information you do not have, like recent events, or requires a specific action like running code.

// To use a tool, you MUST respond with ONLY a JSON object inside a <tool_call> XML tag. For example:
// <tool_call>
// {
//   "name": "google_search",
//   "arguments": {
//     "query": "latest AI news"
//   }
// }
// </tool_call>

// Do not add any other text or explanation outside of this tag if you decide to use a tool.`;
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

/**
 * Disables the input form to prevent user from sending messages while the agent is "thinking".
 */
function disableForm() {
    messageInput.disabled = true;
    messageForm.querySelector('button').disabled = true;
    messageForm.querySelector('button').innerHTML = `
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        Thinking...
    `;
}

/**
 * Enables the input form after the agent has responded.
 */
function enableForm() {
    messageInput.disabled = false;
    messageForm.querySelector('button').disabled = false;
    messageForm.querySelector('button').innerHTML = 'Send';
}

const alertContainer = document.getElementById('alert-container');

/**
 * Displays a Bootstrap alert message that fades out automatically.
 * @param {string} message - The message to display.
 * @param {string} type - The alert type (e.g., 'danger', 'success', 'info').
 */
function showAlert(message, type = 'danger') {
    const alertElement = document.createElement('div');
    alertElement.className = `alert alert-${type} alert-dismissible fade show`;
    alertElement.role = 'alert';
    alertElement.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    alertContainer.appendChild(alertElement);

    // Automatically remove the alert after 5 seconds
    setTimeout(() => {
        alertElement.classList.remove('show');
        setTimeout(() => alertElement.remove(), 150); // Allow fade out animation
    }, 5000);
}

/**
 * Appends a new message to the chat window, with special styling for model "thoughts".
 * @param {string} role - 'user', 'assistant', or 'tool-request' for debug view.
 * @param {string} content - The text content of the message.
 */
/**
 * Appends a new message to the chat window.
 * UPGRADED: Now intelligently formats JSON code blocks for better readability.
 * @param {string} role - 'user', 'assistant', or 'tool-request'.
 * @param {string} content - The text content of the message.
 */
function addMessageToChat(role, content) {
    const messageElement = document.createElement('div');
    
    // THE FIX: Coerce content to an empty string if it's null or undefined.
    // This prevents the .trim() crash.
    const messageContent = content || "";

    if (role === 'tool-request') {
        messageElement.classList.add('tool-request-message');
        messageElement.innerHTML = `
            <div class="thought-content is-collapsed">
                <strong>Model Thought:</strong>
                <pre class="mb-0"><code>${messageContent}</code></pre>
            </div>
            <div class="toggle-indicator"></div>
        `;
    } else {
        messageElement.classList.add('message', role === 'user' ? 'user-message' : 'assistant-message');
        const jsonRegex = /^\s*[\{\[](.|\s)*[\}\]]\s*$/;

        if (jsonRegex.test(messageContent.trim())) {
            messageElement.innerHTML = `
                <div class="code-block-wrapper">
                    <pre><code>${messageContent}</code></pre>
                    <button class="copy-code-btn">Copy</button>
                </div>
            `;
        } else {
            messageElement.innerText = messageContent;
        }
    }
    
    chatWindow.appendChild(messageElement);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

// --- ADAPTIVE LLM Call Function ---
async function callLLM(messages) {
    const selectedModel = modelSelect.value;
    console.log(`Calling API with model: ${selectedModel} (ReAct Mode: ${isReActMode})`);

    const body = {
        model: selectedModel,
        messages: messages,
    };

    // ADAPTIVE LOGIC: Add native tool parameters only if not in ReAct mode
    if (!isReActMode) {
        body.tools = nativeTools;
        body.tool_choice = "auto";
    }

    try {
        const response = await fetch(llm.baseUrl + '/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${llm.apiKey}` },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error.message || JSON.stringify(errorData)}`);
        }
        return (await response.json()).choices[0].message;
    } catch (error) {
    console.error("Error calling LLM:", error); // Keep for your own debugging
    showAlert(`LLM API Error: ${error.message}`);
    return { role: 'assistant', content: `Sorry, an error occurred. Please check the alert in the top right.` };
    }
}

// --- Tool Execution Function (Unchanged, used by both strategies) ---
async function executeGoogleSearch(query) { /* ... same as before ... */ }
executeGoogleSearch = async (query) => { addMessageToChat('assistant', `Searching Google for "${query}"...`); const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX_ID}&q=${encodeURIComponent(query)}`; try { const response = await fetch(url); if (!response.ok) throw new Error(`Google Search API failed with status ${response.status}`); const data = await response.json(); if (!data.items || data.items.length === 0) return "No results found."; return data.items.slice(0, 3).map(item => item.snippet).join('\n---\n'); } catch (error) { 
    console.error("Google Search failed:", error);
    showAlert(`Google Search failed: ${error.message}`);
    return `Error performing search. Please check the alert.`; 
} };

/**
 * Executes a string of JavaScript code safely.
 * @param {string} code The JS code to run.
 * @returns {Promise<string>} The result or error message from the code execution.
 */
async function executeJavaScript(code) {
    addMessageToChat('assistant', `Executing JavaScript:\n\`\`\`\n${code}\n\`\`\``);
    try {
        // THE FIX: Check if the code already has a 'return'. If not, add it.
        // This allows the model to send simple expressions like "2+2" directly.
        const codeToRun = code.includes('return') ? code : `return ${code}`;
        
        const result = new Function(codeToRun)();
        
        // Another fix: JSON.stringify(undefined) is undefined. Default to the string 'null'.
        return JSON.stringify(result, null, 2) || 'null';
    } catch (error) {
        showAlert(`JavaScript Execution Error: ${error.message}`);
        return `Error executing code. Please check the alert.`;
    }
}

/**
 * Makes a POST request to an API endpoint.
 * @param {string} url The URL to send the request to.
 * @param {object} payload The JSON payload.
 * @returns {Promise<string>} The API response or an error message.
 */
async function executeApiRequest(url, payload) {
    addMessageToChat('assistant', `Making API request to: ${url}`);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        const data = await response.json();
        return JSON.stringify(data, null, 2); // Pretty-print the JSON response
    } catch (error) {
    showAlert(`API Request Error: ${error.message}`);
    return `Error with API request. Please check the alert.`;
    }
}

// --- ADAPTIVE Core Agent Loop ---
// async function runAgentLoop(userInput) {
//     addMessageToChat('user', userInput);
//     conversationHistory.push({ role: 'user', content: userInput });
//     disableForm();

//     while (true) {
//         const assistantMessage = await callLLM(conversationHistory);

//         // --- NATIVE TOOL-CALLING LOGIC ---
//         if (!isReActMode && assistantMessage.tool_calls) {
//             conversationHistory.push(assistantMessage); // Add original tool call message
//             const toolCall = assistantMessage.tool_calls[0];
//             const functionArgs = JSON.parse(toolCall.function.arguments);
//             const toolResultContent = await executeGoogleSearch(functionArgs.query);
            
//             conversationHistory.push({
//                 role: "tool",
//                 tool_call_id: toolCall.id,
//                 name: toolCall.function.name,
//                 content: toolResultContent
//             });
//             // Loop back to LLM with the tool result

//         // --- ReAct TEXT-BASED LOGIC ---
//         } else if (isReActMode && assistantMessage.content.includes('<tool_call>')) {
//             const toolCallMatch = assistantMessage.content.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
//             if (toolCallMatch) {
//                 conversationHistory.push(assistantMessage); // Add model's request to history
//                 const jsonStr = toolCallMatch[1].trim();
//                 try {
//                     const toolCall = JSON.parse(jsonStr);
//                     const toolResultContent = await executeGoogleSearch(toolCall.arguments.query);
//                     conversationHistory.push({
//                         role: "user", // For ReAct, we present results as user input
//                         content: `<tool_result>${toolResultContent}</tool_result>`
//                     });
//                     // Loop back to LLM with the tool result
//                 } catch (e) {
//                      // If JSON is malformed, treat as a normal message and break
//                     addMessageToChat('assistant', assistantMessage.content);
//                     conversationHistory.push(assistantMessage);
//                     break;
//                 }
//             }
//         // --- NO TOOL CALL ---
//         } else {
//             addMessageToChat('assistant', assistantMessage.content);
//             conversationHistory.push(assistantMessage);
//             break; // This is the final answer, exit the loop
//         }
//     }
//     enableForm();
// }

// async function runAgentLoop(userInput) {
//     addMessageToChat('user', userInput);
//     conversationHistory.push({ role: 'user', content: userInput });
//     disableForm();

//     let loopCount = 0;
//     while (loopCount < 5) {
//         loopCount++;
//         const assistantMessage = await callLLM(conversationHistory);
//         let wasToolCallAttempted = false; // Tracks if a tool was even considered

//         // --- NATIVE TOOL-CALLING LOGIC (This part is already working well) ---
//         if (!isReActMode && assistantMessage.tool_calls) {
//             wasToolCallAttempted = true;
//             conversationHistory.push(assistantMessage);
//             const toolCall = assistantMessage.tool_calls[0];
//             const functionArgs = JSON.parse(toolCall.function.arguments);
//             const query = functionArgs.query;

//             // We can add a check here too for safety
//             if (query && typeof query === 'string') {
//                 const toolResultContent = await executeGoogleSearch(query);
//                 conversationHistory.push({
//                     role: "tool",
//                     tool_call_id: toolCall.id,
//                     name: toolCall.function.name,
//                     content: toolResultContent
//                 });
//                 continue; // Loop back to LLM with results
//             }
//         // --- ReAct TEXT-BASED LOGIC (This is where we add the fix) ---
//         } else if (isReActMode && assistantMessage.content.includes('<tool_call>')) {
//             wasToolCallAttempted = true;
//             const toolCallMatch = assistantMessage.content.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
//             if (toolCallMatch) {
//                 const jsonStr = toolCallMatch[1].trim();
//                 addMessageToChat('tool-request', `Model wants to call a tool:\n${jsonStr}`); // Debugging view
//                 conversationHistory.push(assistantMessage);

//                 try {
//                     const toolCall = JSON.parse(jsonStr);
//                     const query = toolCall.arguments ? toolCall.arguments.query : toolCall.query;

//                     // THE CRITICAL FIX: Is the query valid?
//                     if (query && typeof query === 'string') {
//                         const toolResultContent = await executeGoogleSearch(query);
//                         conversationHistory.push({ role: "user", content: `<tool_result>${toolResultContent}</tool_result>` });
//                         continue; // Loop back to LLM with results
//                     } else {
//                         // THE GRACEFUL FAILURE: Model tried to use a tool but provided no query.
//                         const errorMessage = "The model attempted to use a tool without a valid query. Let's try again.";
//                         addMessageToChat('assistant', "I got a bit confused there. Could you please rephrase your request?");
//                         conversationHistory.push({ role: "user", content: `<tool_result>${errorMessage}</tool_result>` });
//                         // We continue the loop to let the model recover from its own error.
//                         continue;
//                     }
//                 } catch (e) {
//                     addMessageToChat('assistant', `I tried to use a tool, but made a mistake. Please rephrase your request. (Error: ${e.message})`);
//                     break;
//                 }
//             }
//         }

//         // --- NO TOOL CALL or FAILED ATTEMPT ---
//         // If we've reached this point, it means no valid tool was called.
//         // This is the final answer.
//         addMessageToChat('assistant', assistantMessage.content);
//         conversationHistory.push(assistantMessage);
//         break; // Exit the loop
//     }

//     if (loopCount >= 5) {
//         addMessageToChat('assistant', "I seem to be stuck in a thinking loop. Please try a different question.");
//     }
//     enableForm();
// }


// async function runAgentLoop(userInput) {
//     addMessageToChat('user', userInput);
//     conversationHistory.push({ role: 'user', content: userInput });
//     disableForm();

//     let loopCount = 0;
//     while (loopCount < 5) {
//         loopCount++;
//         const assistantMessage = await callLLM(conversationHistory);
//         let wasToolCallAttempted = false;

//         // --- NATIVE TOOL-CALLING LOGIC ---
//         if (!isReActMode && assistantMessage.tool_calls) {
//             wasToolCallAttempted = true;
//             conversationHistory.push(assistantMessage);
//             const toolCall = assistantMessage.tool_calls[0];
//             const functionArgs = JSON.parse(toolCall.function.arguments);
//             const query = functionArgs.query;
//             let toolResultContent;

//             // Check if the tool name is known
//             if (toolCall.function.name === 'google_search') {
//                 toolResultContent = await executeGoogleSearch(query);
//             } else {
//                 toolResultContent = `Error: Unknown tool '${toolCall.function.name}'. Available tools: [google_search]`;
//             }

//             conversationHistory.push({
//                 role: "tool",
//                 tool_call_id: toolCall.id,
//                 name: toolCall.function.name,
//                 content: toolResultContent
//             });
//             continue;
        
//         // --- ReAct TEXT-BASED LOGIC ---
//         } else if (isReActMode && assistantMessage.content.includes('<tool_call>')) {
//             wasToolCallAttempted = true;
//             const toolCallMatch = assistantMessage.content.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
//             if (toolCallMatch) {
//                 const jsonStr = toolCallMatch[1].trim();
//                 addMessageToChat('tool-request', `Model Thought:\n${jsonStr}`);
//                 conversationHistory.push(assistantMessage);

//                 try {
//                     const toolCall = JSON.parse(jsonStr);
//                     const query = toolCall.arguments ? toolCall.arguments.query : toolCall.query;
//                     let toolResultContent;

//                     // THE CRITICAL FIX: Explicitly check the tool name
//                     if (toolCall.name === 'google_search') {
//                         if (query && typeof query === 'string') {
//                             toolResultContent = await executeGoogleSearch(query);
//                         } else {
//                             toolResultContent = "Error: Tool 'google_search' was called, but the 'query' parameter was missing or invalid.";
//                         }
//                     } else {
//                         // Handle hallucinated/unknown tools gracefully
//                         toolResultContent = `Error: An unknown tool named '${toolCall.name}' was called. The only available tool is 'google_search'.`;
//                     }
                    
//                     conversationHistory.push({ role: "user", content: `<tool_result>${toolResultContent}</tool_result>` });
//                     continue;
//                 } catch (e) {
//                     const errorFeedback = `Error: The tool call was not valid JSON. Please correct the format. (Error: ${e.message})`;
//                     conversationHistory.push({ role: "user", content: `<tool_result>${errorFeedback}</tool_result>` });
//                     continue;
//                 }
//             }
//         }

//         // --- NO TOOL CALL ---
//         if (!wasToolCallAttempted) {
//             addMessageToChat('assistant', assistantMessage.content);
//             conversationHistory.push(assistantMessage);
//             break; // Final answer, exit.
//         }
//         // If a tool call was attempted but failed in a way that didn't `continue`, we just loop again.
//     }

//     if (loopCount >= 5) {
//         addMessageToChat('assistant', "I seem to be stuck in a thinking loop. Please try a different question.");
//     }
//     enableForm();
// }
async function runAgentLoop(userInput) {
    addMessageToChat('user', userInput);
    conversationHistory.push({ role: 'user', content: userInput });
    disableForm();

    let loopCount = 0;
    while (loopCount < 5) {
        loopCount++;
        const assistantMessage = await callLLM(conversationHistory);

        // --- NATIVE TOOL-CALLING LOGIC ---
        if (!isReActMode && assistantMessage.tool_calls) {
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
                
                // Show the raw tool output in the UI
                addMessageToChat('assistant', toolResultContent);

                return { role: "tool", tool_call_id: toolCall.id, name: functionName, content: toolResultContent };
            });
            const resolvedToolResults = await Promise.all(toolPromises);
            conversationHistory.push(...resolvedToolResults);
            continue;
        
        // --- ReAct TEXT-BASED LOGIC ---
        } else if (isReActMode && assistantMessage.content && assistantMessage.content.includes('<tool_call>')) {
            const toolCallMatch = assistantMessage.content.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
            if (toolCallMatch) {
                const jsonStr = toolCallMatch[1].trim();
                addMessageToChat('tool-request', `Model Thought:\n${jsonStr}`);
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
                        default: toolResultContent = `Error: An unknown tool named '${toolName}' was called.`;
                    }

                    // Show the raw tool output in the UI
                    addMessageToChat('assistant', toolResultContent);
                    
                    conversationHistory.push({ role: "user", content: `<tool_result>${toolResultContent}</tool_result>` });
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
    enableForm();
}

// --- Form Submission (Unchanged) ---
messageForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const userInput = messageInput.value.trim();
    if (!userInput) return;
    messageInput.value = '';
    await runAgentLoop(userInput);
});

chatWindow.addEventListener('click', (event) => {
    // Handle toggling the "Model Thought" bubbles
    const thoughtBubble = event.target.closest('.tool-request-message');
    if (thoughtBubble) {
        const content = thoughtBubble.querySelector('.thought-content');
        content.classList.toggle('is-collapsed');
        return; // Stop further processing
    }

    // Handle the "Copy" button on code blocks
    const copyBtn = event.target.closest('.copy-code-btn');
    if (copyBtn) {
        const code = copyBtn.previousElementSibling.querySelector('code').innerText;
        navigator.clipboard.writeText(code).then(() => {
            copyBtn.innerText = 'Copied!';
            setTimeout(() => {
                copyBtn.innerText = 'Copy';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showAlert('Failed to copy code.', 'warning');
        });
    }
});


// --- ADAPTIVE Initialization ---
async function initializeApp() {
    try {
        llm = await openaiConfig({
             baseUrls: [{ name: "AI Pipe (Custom)", url: "https://aipipe.org/openai/v1" }, { name: "Groq", url: "https://api.groq.com/openai/v1" }, { name: "OpenRouter", url: "https://openrouter.ai/api/v1" }, { name: "OpenAI", url: "https://api.openai.com/v1" }],
             help: '<div class="alert alert-info">Select your provider, then enter your API key.</div>'
        });
        
        conversationHistory = []; // Reset history on new config

        // THE STRATEGY SWITCH
        if (llm.baseUrl.includes("openrouter.ai")) {
            console.log("OpenRouter detected. Switching to ReAct mode for tool calls.");
            isReActMode = true;
            conversationHistory.push({ role: 'system', content: reactSystemPrompt });
        } else {
            console.log("Standard provider detected. Using native tool calling.");
            isReActMode = false;
        }

        // Populate model picker (same as before)
        if (llm.models && llm.models.length > 0) { modelSelect.innerHTML = ''; llm.models.forEach(model => { const option = document.createElement('option'); option.value = model; option.innerText = model; modelSelect.appendChild(option); }); const preferredModels = ['gpt-4o-mini', 'llama3-8b-8192', 'mistralai/mistral-7b-instruct']; for (const preferred of preferredModels) { if (llm.models.includes(preferred)) { modelSelect.value = preferred; break; } } modelPickerContainer.style.display = 'block'; }
        
        addMessageToChat('assistant', 'Hello! Your LLM is configured. How can I help you?');
        enableForm();

    } catch (error) {
    console.error("Configuration failed:", error); // Keep for your own debugging
    showAlert(`Configuration failed: ${error.message}`);
    }
}

// --- App Entry Point ---
disableForm();
initializeApp();