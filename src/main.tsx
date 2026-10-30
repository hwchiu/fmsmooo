import './react/regions';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import './react/original.css';
function AppShell(){return <><aside id="rail"><div className="brand"><b>F</b><span>FIELDWORK<small>部署就緒決策</small></span><button id="collapse" aria-label="收合選單" title="收合選單">‹</button></div><div className="navlabel">三個角色・同一份依據</div><nav id="nav"/><div id="dataNav" className="data-nav"/></aside><main><section className="heading"><div><div id="role" className="eyebrow"/><h1 id="title"/><p id="subtitle"/></div><div className="scope"><label>工廠<select id="factory"/></label><label>資料情境<select id="profile" defaultValue="baseline"><option value="baseline">正常建置快照</option><option value="configured">含循環與異常案例</option></select></label></div></section><div className="context"><span id="snapshot"/><span>箭頭：前置 → 使用產品　｜　綠燈可安排部署，資源／窗口另行確認</span></div><section id="trial" hidden/><section id="stats"/><section id="workspace"/><footer>FIELDWORK · 同廠、同產品、同基準，三個視圖共用就緒判定。 Owner 顯示原合成資料的責任團隊。</footer></main><dialog id="planDialog"><div className="dialoghead"><div><div className="eyebrow">CANDIDATE PLAN</div><h2>部署候選方案</h2></div><button id="closePlan">關閉</button></div><div id="planContent"/></dialog><div id="toast" role="status"/></>}
flushSync(()=>createRoot(document.getElementById('root')!).render(<AppShell/>));
import('./features/decision.js').catch(error=>{console.error(error);const host=document.getElementById('workspace');if(host)host.textContent='載入失敗，請重新整理。';});
