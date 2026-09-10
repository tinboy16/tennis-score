const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const get=async p=>{const r=await fetch(p);if(!r.ok)throw Error(p);return r.json()};
async function init(){
 const id=new URLSearchParams(location.search).get('id'); if(!id){$('#playerPage').innerHTML='<div class="loading">Thiếu mã vận động viên.</div>';return}
 try{
  const [players,cats,matches]=await Promise.all([get('data/players.json'),get('data/categories.json'),get('data/matches.json')]);
  const p=players.find(x=>String(x.id||x.playerId)===String(id)); if(!p)throw Error('player');
  const catIds=p.categories||[]; const rankings=await Promise.all(catIds.map(c=>get(`data/rankings/${c}.json`)));
  let best=null;
  rankings.forEach((d,i)=>{const r=(d.players||[]).find(x=>String(x.playerId||x.id)===String(id));if(r&&(!best||Number(r.points||0)>Number(best.points||0)))best={...r,cat:cats.find(c=>c.id===catIds[i])}})
  best=best||{points:0,history:[0],wins:0,losses:0,form:[]};
  const history=best.history||[best.points||0], max=Math.max(...history,1);
  const bars=history.map(v=>Math.max(10,Math.round(v/max*100)));
  const related=(matches||[]).filter(m=>String(m.playerId||m.player1Id||m.playerAId)===String(id)||String(m.opponentId||m.player2Id||m.playerBId)===String(id)).slice(0,8);
  $('#playerPage').innerHTML=`<div class="eyebrow"><i></i> PLAYER PROFILE · 2026</div>
  <section class="profile-hero" style="margin-top:18px"><img class="profile-avatar" src="${esc(p.avatar||'https://i.pravatar.cc/160')}" alt=""><div><div class="profile-meta">${esc(best.cat?.name||'VẬN ĐỘNG VIÊN')} · ${esc(p.city||'Lâm Đồng')}</div><h1 class="profile-name">${esc(p.name)}</h1><div class="profile-meta">${esc(p.club||'Tennis Châu Bảo Ngọc')} · Tay ${esc(p.hand||'Phải')}</div></div><div class="profile-rank"><span>RANKING</span><b>#${best.rank||'—'}</b><span>${Number(best.points||0).toLocaleString('vi-VN')} POINTS</span></div></section>
  <div class="profile-stats"><div class="mini-stat"><b>${best.wins||0}</b><span>TRẬN THẮNG</span></div><div class="mini-stat"><b>${best.losses||0}</b><span>TRẬN THUA</span></div><div class="mini-stat"><b>${Math.max(...history)}</b><span>ĐIỂM CAO NHẤT</span></div><div class="mini-stat"><b>${catIds.length}</b><span>HẠNG MỤC</span></div></div>
  <section class="history-card"><div class="section-head"><div><div class="eyebrow">POINT HISTORY</div><h2>Lịch sử điểm</h2></div><strong>${Number(best.points||0).toLocaleString('vi-VN')} pts</strong></div><div class="chart">${bars.map((h,i)=>`<div class="bar" style="height:${h}%"><span>${history[i]}</span></div>`).join('')}</div><div class="chart-labels">${history.map((_,i)=>`<span>W${i+1}</span>`).join('')}</div></section>
  <section class="history-card"><div class="eyebrow">RECENT FORM</div><h2 style="margin-top:7px">Phong độ gần đây</h2><div class="form" style="margin-top:15px">${(best.form||[]).map(x=>`<i class="${String(x).toUpperCase()==='L'?'l':''}" style="width:30px;height:30px">${esc(x)}</i>`).join('')}</div></section>
  <section class="history-card"><div class="eyebrow">MATCH HISTORY</div><h2 style="margin-top:7px">Lịch sử thi đấu</h2><div class="match-list">${related.length?related.map(m=>`<div class="match-row"><span>${esc(m.date||m.playedAt||'—')}</span><span><b>${esc(m.tournament||m.tournamentName||'Giải đấu')}</b><br><small>${esc(m.opponentName||m.opponent||'Đối thủ')}</small></span><strong class="${String(m.result||'W').toUpperCase()==='W'?'result-win':'result-loss'}">${esc(m.result||'W')} ${m.pointChange!=null?((m.pointChange>0?'+':'')+m.pointChange+' pts'):''}</strong></div>`).join(''):'<div class="loading" style="padding:35px">Chưa có dữ liệu trận đấu.</div>'}</div></section>`;
 }catch(e){$('#playerPage').innerHTML='<div class="loading">Không thể tải hồ sơ vận động viên.</div>'}
}
init();