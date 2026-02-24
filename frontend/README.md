## Frontend Migration (React)

### 1. Verify Node.js is installed (first time)
node -v
npm -v

### 2. Start FastAPI backend
From project root:
```bash
uvicorn api:app --reload
```
Backend runs at http://localhost:8000 so keep this terminal open.

### 3. Install Frontend Dependencies (first time)
```bash
cd frontend
npm install
```

### 4. Run dev server
npm run dev

### 5. Open in browser
http://localhost:5173

