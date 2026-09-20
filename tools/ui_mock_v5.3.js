// v5.3 mock 模式回归：真实树五级联动不受影响
async (page) => {
  await page.goto('http://127.0.0.1:8123/index.html');
  await page.waitForTimeout(2500);
  await page.click('#demoSkipBtn');
  await page.waitForTimeout(3000);

  const pick = async (id, txt) => {
    const r = await page.evaluate((a) => {
      const s = document.getElementById(a.id);
      const o = Array.from(s.options);
      const m = o.find(function (x) { return x.textContent.indexOf(a.txt) === 0; });
      if (m) { s.value = m.value; s.dispatchEvent(new Event('change')); return { picked: m.textContent, count: o.length }; }
      return { picked: null, list: o.map(function (x) { return x.textContent; }).slice(0, 12) };
    }, { id: id, txt: txt });
    await page.waitForTimeout(1500);
    return r;
  };

  const out = {};
  out.region = await pick('orgRegion', '华东一区');
  out.area = await pick('orgArea', '上海区');
  const stores = await page.evaluate(function () {
    const s = document.getElementById('orgStore');
    return Array.from(s.options).map(function (x) { return x.textContent; }).slice(0, 8);
  });
  out.storeOptions = stores;
  // 选第一家真实门店
  if (stores[1]) out.store = await pick('orgStore', stores[1]);
  out.posts = await page.evaluate(function () {
    const s = document.getElementById('orgPost');
    return { disabled: s.disabled, list: Array.from(s.options).map(function (x) { return { t: x.textContent, d: x.disabled }; }) };
  });
  out.persons = await page.evaluate(function () {
    const s = document.getElementById('orgPerson');
    return { total: s.options.length, first: Array.from(s.options).slice(0, 5).map(function (x) { return x.textContent; }) };
  });
  console.log('MOCK RESULT ' + JSON.stringify(out, null, 1));
  await page.screenshot({ path: 'D:/projects/dashboard/shot_v5.3_mock.png' });
  return JSON.stringify(out);
}