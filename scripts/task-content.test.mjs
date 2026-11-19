import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contentView,taskInputView,taskResultView,structuredValue} from '../app/task-content.js';

test('structured and JSON-encoded assignments have readable labels and lists',()=>{
 const content={objective:'Find local makers',acceptance_criteria:['Sources included','Ready for review'],requires_approval:true,budget:0};
 const html=taskInputView({title:'Maker research',task:JSON.stringify(content),context_work_ids:['internal-id']});
 assert.match(html,/<dt>Acceptance criteria<\/dt>/);assert.match(html,/<li><p>Sources included<\/p><\/li>/);assert.match(html,/>Yes</);assert.match(html,/>0</);assert.doesNotMatch(html,/internal-id|acceptance_criteria|&quot;objective/);
 assert.equal(taskInputView({task:'A plain assignment'}),'<p>A plain assignment</p>');
 assert.match(taskInputView({description:'Another assignment'}),/Another assignment/);
 assert.equal(structuredValue('{broken'),'{broken');
});
test('Markdown reports render headings, nested lists, links, tables and code safely',()=>{
 const html=contentView('## Research brief\n\nFirst paragraph.\nSecond line.\n\n- **Maker one**\n  - Verify availability\n- Maker two\n\n1. Draft\n2. Review\n\n[Source](https://example.test/?a=1&b=2)\n\n| Item | State |\n| --- | --- |\n| Print | Ready |\n\n```json\n{"example": true}\n```');
 assert.match(html,/<h4>Research brief<\/h4>/);assert.match(html,/<strong>Maker one<\/strong>/);assert.match(html,/First paragraph\.\nSecond line\./);assert.match(html,/<ul><li>Verify availability<\/li><\/ul>/);assert.match(html,/<ol start="1">/);assert.match(html,/href="https:\/\/example.test\/\?a=1&amp;b=2"/);assert.match(html,/<th scope="col">Item/);assert.match(html,/<pre><code>\{&quot;example&quot;: true\}/);
});
test('external text cannot inject HTML, script, or unsafe links',()=>{
 const html=contentView('<img src=x onerror=alert(1)>\n\n[Click](javascript:alert) [Hidden](data:text/html,script) [Safe](https://example.test/"bad)');
 assert.doesNotMatch(html,/<img|<script|href="javascript:|href="data:/);assert.match(html,/&lt;img/);assert.match(html,/&quot;bad/);
 const encoded=contentView(JSON.stringify({summary:'<script>alert(1)</script>'}));assert.doesNotMatch(encoded,/<script>/);assert.match(encoded,/&lt;script&gt;/);
});
test('results unwrap common envelopes without dropping meaningful content',()=>{
 assert.equal(taskResultView(JSON.stringify({result:'Ready for review',message:'Completed'})),'<p>Ready for review</p>');
 assert.match(taskResultView({result:'Brief',message:'Check the sources first'}),/Check the sources first/);
 assert.match(taskResultView({result:'Brief',confidence:0.8}),/<dt>Confidence<\/dt>/);
 assert.match(contentView(null),/Not provided/);assert.match(contentView([]),/None listed/);assert.match(contentView(false),/>No</);
});
