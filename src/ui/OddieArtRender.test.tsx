import { renderToString } from 'react-dom/server';
import { expect, test } from 'vitest';
import { OddieArt, typeColor } from './OddieArt.tsx';

test('이름 앞 두 글자와 접근성 이름을 그린다', () => {
  const html = renderToString(<OddieArt name="Pippo" types={['grass']} size={80} />);
  expect(html).toContain('Pi');
  expect(html).toContain('aria-label="Pippo"');
  expect(html).toContain('width:80px');
});

test('두 타입이면 두 색 그라데이션, 한 타입이면 같은 색', () => {
  const dual = renderToString(<OddieArt name="Kraklash" types={['fire', 'water']} />);
  expect(dual).toContain(typeColor('fire').toLowerCase());
  expect(dual).toContain(typeColor('water').toLowerCase());
  const single = renderToString(<OddieArt name="Pippo" types={['grass']} />);
  expect(single.split(typeColor('grass').toLowerCase()).length - 1).toBeGreaterThanOrEqual(2);
});
