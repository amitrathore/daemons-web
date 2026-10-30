export function shortConnection(r){return r.short_id||(r.id||r.connection_id||'').replaceAll('-','').slice(0,8);}
export function connectionTitle(r){return `${r.label||r.name||r.assistant?.name||r.client_name||'Assistant'} · ${shortConnection(r)}`;}
