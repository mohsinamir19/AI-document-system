# 🤖 AI Document Intelligence System

> Multi-agent AI system that analyzes documents using autonomous agents with dynamic workflow planning

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![Next.js](https://img.shields.io/badge/Next.js-15+-black)](https://nextjs.org/)

## 🎯 Features

- **🧠 Intelligent Planning** - AI Planner decides optimal workflow for each query
- **📄 Document Analysis** - Upload PDF, DOCX, CSV, TXT files for analysis
- **🔍 Multi-Source Research** - Searches documents + web automatically
- **⚡ Dynamic Routing** - Skips unnecessary agents for fast responses
- **🎨 Real-time Streaming** - Watch agents think and collaborate live
- **💬 Natural Interaction** - Ask questions in plain English

## 🏗️ Architecture

```
User Query
    ↓
🧠 Planner Agent (analyzes query, decides workflow)
    ↓
🔍 Researcher Agent (searches docs/web if needed)
    ↓
✍️ Writer Agent (creates final answer)
    ↓
Response
```

**Smart Routing:**
- Simple queries → Writer only (fast!)
- Document queries → Researcher + Writer
- Complex queries → Full workflow with web search

## 🚀 Quick Start

### Prerequisites

- Python 3.8+
- Node.js 18+
- OpenRouter API key ([Get free key](https://openrouter.ai/))

### Backend Setup

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Add your OpenRouter API key to .env
OPENAI_API_KEY=sk-or-v1-your-key-here

# Run server
python server.py
```

Backend runs on **http://localhost:8000**

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

Frontend runs on **http://localhost:3000**

## 📖 Usage

### 1. Upload Documents
- Click "Upload Document" in sidebar
- Supports: PDF, DOCX, CSV, TXT
- Max size: 10MB per file

### 2. Ask Questions

**Simple queries:**
```
"Hello"
"What is AI?"
```
→ Fast direct answers (Writer only)

**Document analysis:**
```
"Summarize my resume"
"What are the key findings in the report?"
"Extract contact information"
```
→ Searches your documents + provides analysis

**Research queries:**
```
"Latest AI trends in 2025"
"Compare machine learning frameworks"
```
→ Web search + comprehensive answer

### 3. Watch the Workflow

The UI shows each agent in action:
- 🧠 **Planner** - Decides the approach
- 🔍 **Researcher** - Finds information (if needed)
- ✍️ **Writer** - Creates the answer

## 🛠️ Tech Stack

**Backend:**
- FastAPI - High-performance API framework
- CrewAI - Multi-agent orchestration
- OpenRouter - LLM access (Llama 3.1 8B)
- BeautifulSoup - Web scraping

**Frontend:**
- Next.js 15 - React framework
- TypeScript - Type safety
- Tailwind CSS - Styling
- React Markdown - Rich text rendering

## ⚙️ Configuration

### Backend Environment Variables

```env
OPENAI_API_KEY=sk-or-v1-your-key-here
CORS_ORIGIN=http://localhost:3000
```

### Model Selection

Edit `backend/server.py` to change AI model:

```python
# Fast & Free (default)
model="meta-llama/llama-3.1-8b-instruct:free"

# Or use paid models for better quality:
model="anthropic/claude-3-5-sonnet"
model="openai/gpt-4"
```

See [OpenRouter models](https://openrouter.ai/models) for options.

## 🌐 Deployment

### Deploy to Azure

See [azure-deploy.md](./azure-deploy.md) for complete Azure deployment guide.

### Deploy to Other Platforms

**Backend:**
- Railway
- Render
- Google Cloud Run
- AWS Lambda

**Frontend:**
- Vercel (recommended)
- Netlify
- Azure Static Web Apps

## 📁 Project Structure

```
├── backend/
│   ├── server.py              # FastAPI server + agents
│   ├── requirements.txt       # Python dependencies
│   ├── .env.example          # Environment template
│   └── uploads/              # Document storage
├── frontend/
│   ├── app/
│   │   ├── page.tsx          # Main UI component
│   │   ├── layout.tsx        # App layout
│   │   └── globals.css       # Global styles
│   ├── package.json          # Node dependencies
│   └── next.config.js        # Next.js config
└── README.md
```

## 🐛 Troubleshooting

**Backend won't start:**
```bash
# Check Python version
python --version  # Should be 3.8+

# Reinstall dependencies
pip install -r requirements.txt --upgrade
```

**Frontend errors:**
```bash
# Clear Next.js cache
rm -rf .next
npm install
npm run dev
```

**Connection refused:**
- Make sure backend is running on port 8000
- Check firewall settings
- Verify CORS settings in backend

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file

## 👤 Author

**Mohsin Amir** 
- LinkedIn: [mohsinamir-279822224](https://www.linkedin.com/in/mohsin-amir-279822224/)
- Portfolio: [behance.net/mohsinshah9](https://behance.net/mohsinshah9)
- Email: mohsinamir6789@gmail.com

**Sana Batool** 
- LinkedIn: [mohsinamir-279822224](https://www.linkedin.com/in/sana-batool-96484a333/)
- Email: sbatool6678@gmail.com

## 🌟 Show Your Support

Give a ⭐️ if this project helped you!

## 📸 Screenshots

*Coming soon - Add screenshots of your deployed app*

---

**Built with ❤️** | AI Developer & Product Designer
