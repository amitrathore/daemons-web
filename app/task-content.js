// A presentation-only renderer. Stored assignments and reports are never rewritten.
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function structuredValue(value){
  if(typeof value!=='string')return value;
  const text=value.trim();
  if(!text.startsWith('{')&&!text.startsWith('['))return value;
  try{const parsed=JSON.parse(text);return parsed&&typeof parsed==='object'?parsed:value;}catch{return value;}
}
const label=key=>{const text=key.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').trim();return text.charAt(0).toUpperCase()+text.slice(1);};
function link(url,text){
  try{if(/^(https?:\/\/|mailto:)/i.test(url)&&['http:','https:','mailto:'].includes(new URL(url).protocol))return `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;}catch{}
  return text;
}
function inline(text,depth=0){
  // Escape every literal and token independently; raw HTML is always displayed as text.
  if(depth>8)return escape(text);
  const tokens=/`([^`\n]+)`|\[([^\]\n]+)\]\(([^\s)]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|https?:\/\/[^\s<>]+/g;
  let html='',offset=0;
  for(const match of text.matchAll(tokens)){
    html+=escape(text.slice(offset,match.index));
    if(match[1])html+=`<code>${escape(match[1])}</code>`;
    else if(match[2])html+=link(match[3],inline(match[2],depth+1));
    else if(match[4]||match[5])html+=`<strong>${inline(match[4]||match[5],depth+1)}</strong>`;
    else if(match[6])html+=`<em>${inline(match[6],depth+1)}</em>`;
    else{const url=match[0].replace(/[.,;!?]+$/,'');html+=link(url,escape(url))+escape(match[0].slice(url.length));}
    offset=match.index+match[0].length;
  }
  return html+escape(text.slice(offset));
}
const listLine=line=>line.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
const tableCells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());
function markdown(text){
  const lines=text.replace(/\r\n?/g,'\n').split('\n');let html='',i=0;
  while(i<lines.length){
    const line=lines[i];if(!line.trim()){i++;continue;}
    if(/^\s*```/.test(line)){
      const code=[];i++;while(i<lines.length&&!/^\s*```/.test(lines[i]))code.push(lines[i++]);if(i<lines.length)i++;
      html+=`<pre><code>${escape(code.join('\n'))}</code></pre>`;continue;
    }
    const heading=line.match(/^\s*(#{1,6})\s+(.+)$/);
    if(heading){const level=Math.min(6,heading[1].length+2);html+=`<h${level}>${inline(heading[2])}</h${level}>`;i++;continue;}
    if(line.includes('|')&&i+1<lines.length&&tableCells(lines[i+1]).every(c=>/^:?-{3,}:?$/.test(c))){
      const headers=tableCells(line);i+=2;const rows=[];while(i<lines.length&&lines[i].includes('|')&&lines[i].trim())rows.push(tableCells(lines[i++]));
      html+=`<div class="task-table"><table><thead><tr>${headers.map(c=>`<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${headers.map((_,n)=>`<td>${inline(row[n]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;continue;
    }
    const item=listLine(line);
    if(item){
      const indent=item[1].length,ordered=/^\d/.test(item[2]),tag=ordered?'ol':'ul',start=ordered?` start="${parseInt(item[2],10)}"`:'';html+=`<${tag}${start}>`;
      while(i<lines.length){
        const current=listLine(lines[i]);if(!current||current[1].length!==indent||/^\d/.test(current[2])!==ordered)break;
        const content=[current[3]];i++;
        while(i<lines.length&&lines[i].trim()&&/^\s/.test(lines[i])&&(listLine(lines[i])?.[1].length??lines[i].search(/\S/))>indent)content.push(lines[i++].slice(indent+2));
        html+=`<li>${content.length===1?inline(content[0]):markdown(content.join('\n'))}</li>`;
      }
      html+=`</${tag}>`;continue;
    }
    const paragraph=[line];i++;
    while(i<lines.length&&lines[i].trim()&&!/^\s*(#{1,6}\s|```)/.test(lines[i])&&!listLine(lines[i])){
      if(lines[i].includes('|')&&i+1<lines.length&&tableCells(lines[i+1]).every(c=>/^:?-{3,}:?$/.test(c)))break;
      paragraph.push(lines[i++]);
    }
    html+=`<p>${inline(paragraph.join('\n'))}</p>`;
  }
  return html;
}
export function contentView(value,depth=0){
  value=structuredValue(value);
  if(value===null||value===undefined||value==='')return '<span class="task-empty">Not provided.</span>';
  // Bound rendering of unusually deep external data; the full payload remains in technical details.
  if(depth>16)return '<span class="task-empty">See technical details for this nested content.</span>';
  if(Array.isArray(value))return value.length?`<ul>${value.map(item=>`<li>${contentView(item,depth+1)}</li>`).join('')}</ul>`:'<span class="task-empty">None listed.</span>';
  if(typeof value==='object'){
    const entries=Object.entries(value);return entries.length?`<dl class="result-fields">${entries.map(([key,item])=>`<dt>${escape(label(key))}</dt><dd>${contentView(item,depth+1)}</dd>`).join('')}</dl>`:'<span class="task-empty">No details provided.</span>';
  }
  if(typeof value==='boolean')return `<span>${value?'Yes':'No'}</span>`;
  return markdown(String(value));
}
export function taskInputView(input){
  const value=structuredValue(input);
  if(!value||typeof value!=='object'||Array.isArray(value))return contentView(value);
  const entries=Object.entries(value).filter(([key])=>!['context_work_ids','title'].includes(key));
  if(!entries.length)return contentView(value.title||'No task description provided.');
  if(entries.length===1&&['task','description','instructions','request','prompt','goal','summary','objective','question','message','text'].includes(entries[0][0]))return contentView(entries[0][1]);
  return contentView(Object.fromEntries(entries));
}
export function taskResultView(value){
  value=structuredValue(value);
  if(value&&!Array.isArray(value)&&typeof value==='object'&&'result' in value&&Object.keys(value).every(k=>['result','message'].includes(k))){
    return contentView(value.result)+(value.message&&!/^(completed?|done|succeeded)$/i.test(String(value.message).trim())?contentView(value.message):'');
  }
  return contentView(value);
}
