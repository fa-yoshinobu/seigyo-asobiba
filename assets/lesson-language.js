// Translate the presentation only. Circuit keys, measurements and saved discoveries
// keep their original values regardless of the selected language.
(() => {
  const japanese = /[ぁ-ゖァ-ヺ一-龯々]/u;
  const preference = 'seigyo-asobiba.language';
  const urlLanguage = new URL(location.href).searchParams.get('lang');
  let saved;
  try { saved = localStorage.getItem(preference); } catch {}
  let language = (urlLanguage || saved) === 'en' ? 'en' : 'ja';
  const dictionary = Object.assign(Object.create(null), window.lessonEnglish, window.lessonTerms);
  // Insertions such as a terminal ID or a live measurement separate the static phrases.
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pieces = new RegExp(Object.keys(dictionary).sort((a,b) => b.length-a.length).map(escape).join('|'), 'gu');
  const cache = new Map();
  const texts = new WeakMap();
  const attributes = new WeakMap();
  const paragraphs = new WeakMap();
  const fitted = new WeakMap();
  let partBoundsChanged = false;
  const translatedAttrs = ['aria-label','title','alt','placeholder'];

  function english(source) {
    if (!japanese.test(source)) return source;
    const key = source.trim();
    if (Object.hasOwn(dictionary,key)) return source.replace(key, () => dictionary[key]);
    if (cache.has(source)) return cache.get(source);
    const result = source.replace(pieces, match => ' ' + dictionary[match] + ' ')
      .replace(/\s+/g,' ').replace(/ +([,.;:!?)])/g,'$1').replace(/([(]) +/g,'$1').trim();
    if (cache.size >= 3000) cache.clear();
    cache.set(source,result);
    return result;
  }
  const text = source => language === 'en' ? english(String(source)) : source;
  const skip = element => element.closest('script,style,noscript,textarea,[translate="no"]');

  function translateText(node) {
    const element = node.parentElement;
    if (!element || skip(element)) return;
    const partLabel = element instanceof SVGTextElement && element.ownerSVGElement?.id === 'pstruct';
    const old = texts.get(node);
    if (language === 'ja') {
      if (old && node.data === old.en) node.data = old.ja;
      if (old && partLabel) partBoundsChanged = true;
      if (fitted.has(element)) {
        element.removeAttribute('textLength'); element.removeAttribute('lengthAdjust'); fitted.delete(element);
      }
      texts.delete(node);
      return;
    }
    if (old && old.en === node.data) return;
    const ja = node.data;
    if (!japanese.test(ja)) return;
    const en = english(ja);
    if (ja === en) return;
    // Limit English callouts to the space reserved for the Japanese label.
    const isLabel = element instanceof SVGTextElement && element.childNodes.length === 1;
    let width = 0;
    if (isLabel && (!element.hasAttribute('textLength') || fitted.has(element))) {
      if (fitted.has(element)) element.removeAttribute('textLength');
      width = element.getComputedTextLength();
    }
    texts.set(node,{ja,en});
    node.data = en;
    const maxWidth = width * (partLabel ? 1.28 : 1.1);
    if (width > 0 && element.getComputedTextLength() > maxWidth) {
      element.setAttribute('textLength',String(maxWidth));
      element.setAttribute('lengthAdjust','spacingAndGlyphs');
      fitted.set(element,true);
    }
    if (partLabel) partBoundsChanged = true;
  }
  function fitPartView() {
    if (!partBoundsChanged) return;
    partBoundsChanged = false;
    const svg = document.getElementById('pstruct');
    if (!svg || !svg.isConnected) return;
    const b = svg.getBBox(), x = Math.min(0,Math.floor(b.x)-4), y = Math.min(0,Math.floor(b.y)-4);
    svg.setAttribute('viewBox',[x,y,Math.max(260,Math.ceil(b.x+b.width)+4)-x,Math.max(160,Math.ceil(b.y+b.height)+4)-y].join(' '));
  }
  function translateAttr(element,name) {
    const value = element.getAttribute(name);
    if (value === null) return;
    const values = attributes.get(element) || {};
    const old = values[name];
    if (language === 'ja') {
      if (old && value === old.en) element.setAttribute(name,old.ja);
      delete values[name];
    } else if (old?.en !== value && japanese.test(value)) {
      const en = english(value);
      values[name] = {ja:value,en}; attributes.set(element,values);
      if (en !== value) element.setAttribute(name,en);
    }
  }
  function visit(node) {
    if (node.nodeType === Node.TEXT_NODE) { translateText(node); return; }
    if (node.nodeType !== Node.ELEMENT_NODE || skip(node)) return;
    for (const attr of translatedAttrs) if (node.hasAttribute(attr)) translateAttr(node,attr);
    // Translate a sentence across emphasis tags as a unit. Restore its original
    // nodes on return to Japanese; leave controls, IDs, links and live values alone.
    if (node.matches('p,#say') && !node.closest('#ptext')) {
      const savedParagraph = paragraphs.get(node);
      if (language === 'ja' && savedParagraph) {
        if (node.firstChild === savedParagraph.display) node.replaceChildren(...savedParagraph.nodes);
        paragraphs.delete(node);
      } else if (language === 'en' && node.children.length &&
          [...node.querySelectorAll('*')].every(el => el.matches('b,strong,em,kbd,br') && !el.id)) {
        const original = node.textContent.trim();
        if (Object.hasOwn(dictionary,original)) {
          const display = document.createTextNode(dictionary[original]);
          paragraphs.set(node,{nodes:[...node.childNodes],display});
          node.replaceChildren(display);
          return;
        }
      }
    }
    for (const child of node.childNodes) visit(child);
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') {
        if (!skip(record.target)) translateAttr(record.target,record.attributeName);
      } else if (record.type === 'characterData') translateText(record.target);
      else if (record.target.nodeType === 1 && record.target.matches('p,#say') && record.target.children.length) visit(record.target);
      else for (const node of record.addedNodes) if (node.isConnected) visit(node);
    }
    fitPartView();
  });
  function apply() {
    observer.disconnect();
    document.documentElement.lang = language;
    document.querySelectorAll('[data-language]').forEach(select => {select.value = language;});
    document.dispatchEvent(new Event('lessonlanguagechange'));
    visit(document.head.querySelector('title')); visit(document.body);
    fitPartView();
    if (language === 'en') observer.observe(document.documentElement,{
      subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:translatedAttrs
    });
  }
  window.lessonLanguage = {text, get current() {return language;}};
  document.querySelectorAll('[data-language]').forEach(select => {
    select.addEventListener('change',() => {
      language = select.value === 'en' ? 'en' : 'ja';
      saved = language;
      try {localStorage.setItem(preference,language);} catch {}
      const url = new URL(location.href); url.searchParams.set('lang',language);
      try {history.replaceState(history.state,'',url);} catch {}
      apply();
    });
  });
  // file: pages can have different localStorage areas. Carry the explicit choice
  // on internal links as well, including the standalone parts view and its hash.
  function linkLanguage(event) {
    const link = event.target.closest?.('a[href]');
    if (!link || link.origin !== location.origin || !link.pathname.endsWith('.html')) return;
    const url = new URL(link.href);
    if (language === 'en' || urlLanguage || saved || new URL(location.href).searchParams.has('lang')) {
      url.searchParams.set('lang',language); link.href = url.href;
    }
  }
  document.addEventListener('click',linkLanguage,true);
  document.addEventListener('auxclick',linkLanguage,true);
  apply();
})();
