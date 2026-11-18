// Parcourt chaque écran du site à la largeur de ce cadre (téléphone / tablette) et signale
// tout élément qui dépasse de l'écran. Résultat envoyé à tests.html via postMessage.
const W = () => document.documentElement.clientWidth;

function scrollable(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const ox = getComputedStyle(p).overflowX;
    if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
  }
  return false;
}

export function inspect(label) {
  const w = W();
  const out = [];
  if (document.documentElement.scrollWidth > w + 1) out.push(`${label} : la page défile horizontalement (${document.documentElement.scrollWidth} px pour ${w} px)`);
  for (const el of document.querySelectorAll('#app *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || el.closest('dialog:not([open])')) continue;
    if ((r.right > w + 1 || r.left < -1) && !scrollable(el)) {
      out.push(`${label} : <${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''}> dépasse (${Math.round(r.left)} → ${Math.round(r.right)} px)`);
      break;
    }
  }
  return out;
}

const { smokeTest } = await import('./main.js');
let problems;
try {
  problems = await smokeTest({ inspect });
} catch (e) {
  problems = [`exception : ${e.message}`];
}
parent.postMessage({ type: 'layout-test', width: W(), problems: [...new Set(problems)] }, location.origin);
