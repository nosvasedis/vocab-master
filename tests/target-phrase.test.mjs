import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { splitTargetInPhrase, renderLingoLauncher, buildWorksheetPrintDocument, buildLingoDocx } from '../desktop/renderer/app.js';

const cases = [
  ['compete','They are competing today.',['competing']],
  ['happy','I feel happier today.',['happier']],
  ['give up','She gave it up yesterday.',['gave','up']],
  ['take care of','Please take care of the plants.',['take care of']],
  ['go','They went home.',['went']],
  ['run','Keep running.',['running']],
  ['child','The children play.',['children']],
  ['ice cream','We ate ice-cream.',['ice-cream']],
  ['read','I am ready.',[]],
  ['cat','A catalogue lists the books.',[]],
  ['city','A citizen asked a question.',[]],
];
for (const [word,phrase,expected] of cases) test(`target highlighting: ${word} in ${phrase}`,()=>{
  const parts=splitTargetInPhrase(phrase,word);
  assert.equal(parts.map((p)=>p.text).join(''),phrase);
  assert.deepEqual(parts.filter((p)=>p.bold).map((p)=>p.text),expected);
});
const data={meta:{bookTitle:'Phrase highlighting check',unit:1},lingoLauncher:{vocabulary:cases.slice(0,4).map(([english,collocation],i)=>({number:i+1,english,collocation,greek:'δοκιμή',type:'v.'})),practice:[]}};
test('preview and PDF markup share escaped bold target runs',()=>{
  const html=renderLingoLauncher(data);
  for (const word of ['competing','happier','gave','up','take care of']) assert.ok(html.includes(`<b class="v-target">${word}</b>`));
  const print=buildWorksheetPrintDocument(html,'Highlighting check');
  assert.ok(print.includes(html)); assert.match(print,/\.v-coll \.v-target\s*\{[^}]*font-weight: 800/);
  const unsafe=structuredClone(data);unsafe.lingoLauncher.vocabulary[0].collocation='<script>competing & learning</script>';
  const escaped=renderLingoLauncher(unsafe);assert.ok(!escaped.includes('<script>'));assert.ok(escaped.includes('&lt;script&gt;'));
});
test('Word export uses bold italic runs for the same inflected and separated targets',async()=>{
  const blob=await buildLingoDocx(data);const zip=await JSZip.loadAsync(await blob.arrayBuffer());
  const xml=await zip.file('word/document.xml').async('string');
  const runs=[...xml.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)].map((m)=>m[0]);
  const highlighted=runs.filter((r)=>/<w:b\s*\/>/.test(r)&&/<w:i\s*\/>/.test(r)).flatMap((r)=>[...r.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m)=>m[1]));
  assert.deepEqual(highlighted.sort(),['competing','happier','gave','up','take care of'].sort());
});
