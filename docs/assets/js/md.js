export function md(s=""){
  const esc = (x)=>x.replace(/[&<>]/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[m]));
  let out = esc(s).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_,t,u)=>`<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
  out = out.replace(/\n{2,}/g,'</p><p>').replace(/\n/g,'<br>');
  return `<p>${out}</p>`;
}
