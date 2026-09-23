import assert from 'assert';
import {
    countHoles,
    extractScaffoldJson,
    parseAndValidateScaffold,
    parseScaffoldPayload,
    validateScaffold,
    type ScaffoldPayload,
} from './scaffoldParse';

// —— countHoles ——
assert.deepStrictEqual(countHoles('x = ______\n# TODO(1): do\nif ______:'), {
    expression: 2,
    block: 1,
    total: 3,
});
assert.deepStrictEqual(countHoles('no holes here'), { expression: 0, block: 0, total: 0 });

// —— extractScaffoldJson ——
assert.strictEqual(extractScaffoldJson('```json\n{"a":1}\n```'), '{"a":1}');
assert.strictEqual(extractScaffoldJson('```scaffold-def\n{"a":1}\n```'), '{"a":1}');
assert.strictEqual(extractScaffoldJson('前缀说明文字 {"a":1} 后缀'), '{"a":1}');
assert.strictEqual(extractScaffoldJson('{"a":1}'), '{"a":1}');
assert.strictEqual(extractScaffoldJson(''), '');

// —— 三档递进 + 防泄漏 ——
const pyS0 = [
    'a, b, c = map(int, input().split())',
    '',
    '# TODO(1): 找出三个数中的最大值',
    'max_value = ______',
    '',
    '# TODO(2): 比较并更新最大值',
    'if ______:',
    '    ______',
    '',
    'print(max_value)',
].join('\n'); // 5 holes

const pyS1 = [
    'a, b, c = map(int, input().split())',
    'max_value = a',
    'if ______:',
    '    max_value = ______',
    'if ______:',
    '    max_value = ______',
    'print(max_value)',
].join('\n'); // 4 holes

const pyS3 = [
    'a, b, c = map(int, input().split())',
    'max_value = a',
    'if b > max_value:',
    '    max_value = b',
    'if c > ______:',
    '    max_value = ______',
    'print(max_value)',
].join('\n'); // 2 holes

const cppS0 = [
    '#include <iostream>',
    'using namespace std;',
    'int main() {',
    '    int a, b, c;',
    '    cin >> a >> b >> c;',
    '    // TODO(1): 找出最大值',
    '    int max_value = ______;',
    '    // TODO(2): 比较更新',
    '    if (______) {',
    '        ______;',
    '    }',
    '    cout << max_value << endl;',
    '    return 0;',
    '}',
].join('\n'); // 5 holes

const cppS1 = [
    '#include <iostream>',
    'using namespace std;',
    'int main() {',
    '    int a, b, c;',
    '    cin >> a >> b >> c;',
    '    int max_value = a;',
    '    if (______) { max_value = ______; }',
    '    if (______) { max_value = ______; }',
    '    cout << max_value << endl;',
    '    return 0;',
    '}',
].join('\n'); // 4 holes

const cppS3 = [
    '#include <iostream>',
    'using namespace std;',
    'int main() {',
    '    int a, b, c;',
    '    cin >> a >> b >> c;',
    '    int max_value = a;',
    '    if (b > max_value) max_value = b;',
    '    if (c > ______) max_value = ______;',
    '    cout << max_value << endl;',
    '    return 0;',
    '}',
].join('\n'); // 2 holes

function buildPayload(): ScaffoldPayload {
    return {
        langs: ['python', 'cpp'],
        stages: [
            { id: 'read_input', title: '读取输入' },
            { id: 'compare_b', title: '比较第二个数' },
            { id: 'compare_c', title: '比较第三个数' },
        ],
        protectedStages: ['compare_b', 'compare_c'],
        concepts: ['条件判断', '最大值变量'],
        commonMistakes: ['max_value 初始化为 0'],
        templates: {
            python: { '0': pyS0, '1': pyS1, '3': pyS3 },
            cpp: { '0': cppS0, '1': cppS1, '3': cppS3 },
        },
    };
}

// parse + validate 通过
const validJson = JSON.stringify(buildPayload());
const parsed = parseScaffoldPayload(validJson);
assert.ok(parsed, 'payload 应可解析');
const validated = validateScaffold(parsed!);
assert.strictEqual(validated.ok, true);

// 递进不满足 → 失败（把 S1 挖空清空，使其总挖空 < S0 仍成立但 S1>=S3 破坏？这里直接构造 S3 挖空为 0）
const badProg = buildPayload();
badProg.templates.python['3'] = badProg.templates.python['3'].replace(/______/g, 'ok');
const badProgValidated = validateScaffold(badProg);
assert.strictEqual(badProgValidated.ok, false);

// S0 防泄漏：挖空 < 2 → 失败
const leak = buildPayload();
leak.templates.python['0'] = 'a, b, c = map(int, input().split())\nprint(max(a, b, c))';
const leakValidated = validateScaffold(leak);
assert.strictEqual(leakValidated.ok, false);

// 缺语言模板 → 失败
const empty = parseScaffoldPayload('{"langs":["python"],"templates":{}}');
assert.strictEqual(validateScaffold(empty!).ok, false);

// 端到端：JSON 文本 → ok
const endToEnd = parseAndValidateScaffold('```json\n' + validJson + '\n```');
assert.strictEqual(endToEnd.ok, true);

// 端到端：非法 JSON → 失败
const badJson = parseAndValidateScaffold('这不是 JSON');
assert.strictEqual(badJson.ok, false);

console.log('scaffoldParse.test.ts: ok');
