# FIELDWORK — React / Node.js 22

原站 v37 遷移至 React 19.2 + Vite + TypeScript 渲染邊界，保留原 CSS、Cytoscape、資料與功能控制器。

執行：`nvm use`、`npm ci`、`npm run build`、`npm test`、`npm start`，開啟 http://127.0.0.1:3000 。已以 Node.js 22.21.1 實際建置及測試。

- src/main.tsx：React JSX 應用外框。
- src/react：React 區域元件與生命週期介面。模板轉成 React 元素，不使用 iframe 或 dangerouslySetInnerHTML。
- src/features：保留功能控制器、事件代理、Graph interop 與純模型。並非所有控制器均已重寫為 hooks/useReducer。
- src/repository.ts：JSON snapshot adapter；Go 尚未接入。
- baseline：原始程式封存，不發布。
- tests：回歸及原版結果對照。
- design/QA.md：驗證紀錄與限制。

新網址不繼承原網址 localStorage。Sites 發布靜態 React 產物，線上主機不是 Node 22 程序。server 與 Dockerfile 提供獨立 Node 22 託管形式；Docker 建置未在此環境實測。Go API 目前未實作，Node /api/* 明確回 501。
