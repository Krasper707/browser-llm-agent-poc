# Browser LLM Agent Proof-of-Concept

A minimal, browser-based LLM agent that uses an adaptive reasoning loop to leverage multiple tools (Web Search, Code Execution, API calls). This project is designed for simplicity and hackability, running entirely in the browser with no backend required.


---

## ✨ Features

- **Browser-Based:** Runs entirely on the client-side. No server or complex setup needed.
- **Provider Agnostic:** Uses `bootstrap-llm-provider` to let users bring their own OpenAI-compatible API keys (OpenAI, Groq, OpenRouter, etc.).
- **Multi-Tool Capability:** The agent can dynamically choose to use one of several tools:
    - 🌐 **Google Search:** Access real-time information from the web.
    - 💻 **JavaScript Executor:** Run sandboxed JavaScript code for calculations and logic.
    - 🔌 **API Requester:** Make POST requests to external APIs.
- **Adaptive Reasoning Loop:** Intelligently switches between two strategies based on the provider's capabilities:
    - **Native Tool Calling:** For powerful providers (like Groq & OpenAI), it uses the modern, efficient tool-calling API.
    - **ReAct Fallback:** For providers with limited free tiers (like OpenRouter), it automatically switches to a robust text-based "Reason+Act" prompting strategy to ensure compatibility.
- **Self-Correcting:** The ReAct loop is designed to handle model hallucinations, forcing the LLM to recover from its own errors (e.g., calling a non-existent tool).
- **Minimalist Stack:** Built with vanilla JavaScript, HTML, and Bootstrap for maximum hackability and ease of understanding.

## 🚀 Getting Started

To run this project locally, follow these simple steps.

### 1. Prerequisites

You will need API keys for the services you intend to use:
- **LLM Provider Key:** An API key from an OpenAI-compatible provider (e.g., [Groq](https://console.groq.com/keys), [OpenAI](https://platform.openai.com/api-keys), [OpenRouter](https://openrouter.ai/keys)).
- **Google Search API Key:**
    1. An [API Key](https://console.cloud.google.com/apis/credentials) from a Google Cloud project.
    2. A [Programmable Search Engine ID](https://programmablesearchengine.google.com/controlpanel/all) configured to search the entire web.
    3. Ensure the **Custom Search JSON API** is enabled in your Google Cloud project.

### 2. Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-github-username/browser-llm-agent-poc.git
    cd browser-llm-agent-poc
    ```

2.  **Add your API credentials:**
    Open the `script.js` file and replace the placeholder values at the top:
    ```javascript
    const GOOGLE_API_KEY = "YOUR_GOOGLE_API_KEY_HERE";
    const GOOGLE_CX_ID = "YOUR_SEARCH_ENGINE_ID_HERE";
    ```
    > **⚠️ Warning:** Do not commit your API keys to a public repository. This setup is for local development only.

3.  **Run a local server:**
    Since the app makes API calls, it must be served over `http://`, not `file://`. The easiest way is to use Python's built-in server.
    ```bash
    # For Python 3
    python -m http.server

    # For Python 2
    python -m SimpleHTTPServer
    ```

4.  **Open the application:**
    Open your web browser and navigate to `http://localhost:8000`.

## 🤖 How to Use

1.  On first load, a modal will appear. Select your desired LLM Provider, enter your API key, and click "Save & Test".
2.  Once configured, the chat interface will become active.
3.  Type a prompt and let the agent reason!

### Example Prompts

- **To trigger Google Search:**
  > "What's the latest news about NASA's Artemis mission?"

- **To trigger the JS Executor:**
  > "Calculate 2 to the power of 32."
  > "Sort this array and return the result: [9, 3, 5, 1, 8]"

- **To trigger the API Requester:**
  > "Use the API requester to create a new post at https://jsonplaceholder.typicode.com/posts with a title of 'Hello Agent' and a body of 'This is a test'."

## 🔧 Code Structure

The project is intentionally kept simple with three core files:

-   **`index.html`**: Contains the HTML structure for the chat interface and the model-picker dropdown.
-   **`style.css`**: Provides custom styling to make the chat window look good and includes a special style for the agent's "thoughts" in ReAct mode.
-   **`script.js`**: The heart of the agent. Contains all logic for the UI, API calls, tool definitions, and the core adaptive reasoning loop (`runAgentLoop`).

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for details.
