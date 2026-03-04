## Frontend Migration (React)

### 1. Verify Node.js is installed (first time)
node -v
npm -v

### 2. Install Python Dependencies (first time)
From project root:
```bash
pip install fastapi uvicorn geopy geocoder react-markdown
```

### 3. Start FastAPI backend, in first terminal
From project root:
```bash
uvicorn api:app --reload
```
Backend runs at http://localhost:8000 so keep this terminal open.

### 4. Install Frontend Dependencies (first time)
```bash
cd frontend
npm install

```

### 5. Run dev server, in a second terminal
```bash
cd frontend
npm run dev
```

### 5. Open in browser
http://localhost:5173
