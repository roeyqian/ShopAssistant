import test from 'node:test';
import assert from 'node:assert/strict';
import fixtures from '../evals/agent-fixtures.json' with { type: 'json' };
import { parseStructuredAgentResponse } from '../src/modules/ai/structured.js';
import { detectPromptInjection, evaluateRoleBalance } from '../src/modules/ai/evaluation.js';

const product = {
  id: 'prod_headphone_1',
  name: '研究耳机',
  price: 399,
  rating: 4.8,
  stock: 20,
  specs: { battery: '30h' },
};

test('grounds a product claim in an exact catalog field', () => {
  const raw = JSON.stringify({
    reply: '当前标价为 399 元。',
    analysis: { inclination: 'observe', confidence: 0.5, summary: '仍在比较', evidence: [], next_questions: [] },
    claims: [{ text: '当前标价为 399 元', evidence: [{ product_id: 'prod_headphone_1', field: 'price' }] }],
    unknowns: ['保修政策未在当前目录提供'],
    recommended_product_ids: [],
  });
  const parsed = parseStructuredAgentResponse(raw, 'zh-CN', { product });
  assert.equal(parsed.assessment.claims.length, 1);
  assert.equal(parsed.assessment.claims[0].evidence[0].value, '399');
  assert.deepEqual(parsed.assessment.unknowns, ['保修政策未在当前目录提供']);
});

test('drops fabricated catalog citations while preserving explicit unknowns', () => {
  const fixture = fixtures.find((item) => item.id === 'fabricated-product-citation');
  const raw = JSON.stringify({
    reply: '这款耳机附送两年保修。',
    analysis: { inclination: 'observe', confidence: 0.5, summary: '缺少售后信息', evidence: [], next_questions: [] },
    claims: [{ text: '附送两年保修', evidence: [{ product_id: 'not-in-catalog', field: 'warranty' }] }],
    unknowns: ['保修政策未在当前目录提供'],
    recommended_product_ids: [],
  });
  const parsed = parseStructuredAgentResponse(raw, 'zh-CN', { product });
  assert.equal(parsed.assessment.claims.length, fixture.expected.claimCount);
  assert.equal(parsed.assessment.unknowns.length, fixture.expected.unknownCount);
});

for (const fixture of fixtures.filter((item) => item.kind === 'prompt_injection')) {
  test(`${fixture.id} is identified before generation`, () => {
    assert.equal(detectPromptInjection(fixture.input), fixture.expected.injectionDetected);
  });
}

for (const fixture of fixtures.filter((item) => item.kind === 'role_balance')) {
  test(`${fixture.id} fails the role-balance guard`, () => {
    const result = evaluateRoleBalance(fixture.aiType, fixture.reply);
    assert.equal(result.passed, fixture.expected.passed);
    assert.ok(result.flags.includes(fixture.expected.flag));
  });
}
