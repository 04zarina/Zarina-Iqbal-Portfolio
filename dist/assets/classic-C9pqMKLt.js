import{s as f,e as g,a as v,p as u}from"./experience-CY5cJiN6.js";const s=document.getElementById("classic-theme-btn");let a=localStorage.getItem("theme_preference")||"day";document.documentElement.setAttribute("data-theme",a);m();s==null||s.addEventListener("click",()=>{a=a==="day"?"dusk":"day",localStorage.setItem("theme_preference",a),document.documentElement.setAttribute("data-theme",a),m()});function m(){s&&(s.innerText=a==="dusk"?"☀️ Day Mode":"🌙 Dusk Mode")}const d=document.getElementById("classic-project-list"),r=document.getElementById("project-search");function p(e=""){d.innerHTML="",u.filter(t=>{const n=e.toLowerCase();return t.title.toLowerCase().includes(n)||t.tags.some(o=>o.toLowerCase().includes(n))}).forEach(t=>{var o,l;const n=document.createElement("div");n.className="project-item",n.innerHTML=`
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <h3 style="font-family:var(--font-display); font-size:1.2rem;">${t.title}</h3>
          <span class="chip" style="background:var(--butter);">${t.year}</span>
        </div>
        <p style="font-size:0.88rem; font-weight:700; color:var(--text-muted); margin-bottom:8px;">${t.tagline}</p>
        <p style="font-size:0.86rem; line-height:1.45; margin-bottom:12px;">${t.description}</p>
        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:12px;">
          ${t.tools.map(y=>`<span class="chip" style="font-size:0.75rem;">${y}</span>`).join("")}
        </div>
      </div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        ${(o=t.links)!=null&&o.play?`<a href="${t.links.play}" target="_blank" class="sticker-btn accent-mint" style="padding:4px 12px; font-size:0.8rem;">Play</a>`:""}
        ${(l=t.links)!=null&&l.repo?`<a href="${t.links.repo}" target="_blank" class="sticker-btn accent-sky" style="padding:4px 12px; font-size:0.8rem;">Code</a>`:""}
      </div>
    `,d.appendChild(n)})}r==null||r.addEventListener("input",e=>{p(e.target.value)});p();const x=document.getElementById("classic-skills-list");f.forEach(e=>{const i=document.createElement("div");i.className="chip",i.style.cssText="padding:8px 14px; font-size:0.88rem; background:var(--cream);",i.innerHTML=`<strong>${e.name}</strong> <span style="opacity:0.7;">(${e.category} • Lvl ${e.level}/5)</span>`,x.appendChild(i)});const h=document.getElementById("classic-timeline-list");h.innerHTML=`
  <h3 style="font-family:var(--font-display); margin-bottom:8px;">Experience</h3>
  ${g.map(e=>`
    <div style="margin-bottom:14px; padding-left:12px; border-left:3px solid var(--cocoa);">
      <div style="font-weight:700;">${e.title} — ${e.org}</div>
      <div style="font-size:0.82rem; color:var(--text-muted);">${e.start} - ${e.end}</div>
      <div style="font-size:0.88rem; margin-top:4px;">${e.summary}</div>
    </div>
  `).join("")}

  <h3 style="font-family:var(--font-display); margin:18px 0 8px 0;">Education</h3>
  ${v.map(e=>`
    <div style="margin-bottom:14px; padding-left:12px; border-left:3px solid var(--cocoa);">
      <div style="font-weight:700;">${e.title} — ${e.org}</div>
      <div style="font-size:0.82rem; color:var(--text-muted);">${e.start} - ${e.end}</div>
      <div style="font-size:0.88rem; margin-top:4px;">${e.summary}</div>
    </div>
  `).join("")}
`;var c;(c=document.getElementById("classic-contact-form"))==null||c.addEventListener("submit",e=>{e.preventDefault(),alert("Thank you! Your letter has been posted to Alex Morgan."),e.target.reset()});
//# sourceMappingURL=classic-C9pqMKLt.js.map
