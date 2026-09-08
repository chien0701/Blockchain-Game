import{j as e}from"./index-Cy_hutYw.js";const a=[{key:"commit",label:"① 承諾",sub:"Commit"},{key:"reveal",label:"② 揭露",sub:"Reveal"},{key:"play",label:"③ 遊玩",sub:"Play"},{key:"result",label:"④ 結果",sub:"Settle"}];function d({currentPhase:i}){const s=a.findIndex(l=>l.key===i);return e.jsx("div",{className:"flex items-center justify-center gap-0 mb-10",children:a.map((l,t)=>{const r=t<s,c=t===s,n=t>s;return e.jsxs("div",{className:"flex items-center",children:[e.jsxs("div",{className:"flex flex-col items-center",children:[e.jsx("div",{className:`w-10 h-10 rounded-full flex items-center justify-center
                               font-bold text-sm border-2 transition-all
                ${r?"bg-emerald-500 border-emerald-500 text-white":""}
                ${c?"bg-electric-600 border-electric-400 text-white scale-110 shadow-lg shadow-electric-800":""}
                ${n?"bg-ink-800 border-gray-700 text-gray-500":""}`,children:r?"✓":t+1}),e.jsx("div",{className:`text-xs mt-1 font-medium
                ${c?"text-electric-400":""}
                ${r?"text-emerald-400":""}
                ${n?"text-gray-600":""}`,children:l.label}),e.jsx("div",{className:"text-xs text-gray-600",children:l.sub})]}),t<a.length-1&&e.jsx("div",{className:`w-12 sm:w-16 h-0.5 mb-5
                ${t<s?"bg-emerald-500":"bg-gray-700"}`})]},l.key)})})}export{d as S};
