async function getJSON(p){const r=await fetch(p);if(!r.ok)throw new Error(p);return r.json()}
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
async function initHome(){
 try{
  const cats=await getJSON('data/categories.json'), players=await getJSON('data/players.json');
  $('#categoryGrid').innerHTML=cats.filter(c=>c.active!==false).map((c,i)=>{
    const count=players.filter(p=>(p.categories||[]).includes(c.id)).length;
    return `<a class="category-card" href="bang-diem.html?category=${encodeURIComponent(c.id)}"><span class="cat-no">0${i+1} / 2026</span><h3>${esc(c.name)}</h3><p>${esc(c.description||'Bảng xếp hạng chính thức')}</p><div class="cat-foot"><span>${count} VĐV</span><span>Xem ranking →</span></div></a>`;
  }).join('');
 }catch(e){$('#categoryGrid').innerHTML='<div class="loading">Không thể tải dữ liệu.</div>'}
}
if(location.pathname.endsWith('index.html')||location.pathname.endsWith('/'))initHome();