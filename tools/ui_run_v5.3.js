// v5.3 全链路实测：token 已存在，直接验证 虚拟区→虚拟1区→上海一区→上海浦东旗舰店→岗位→人员
async (page) => {
  await page.goto('http://127.0.0.1:8123/_t_v5.3.html');
  await page.waitForTimeout(4000);

  const pick = async (id, txt) => {
    const r = await page.evaluate((a) => {
      const s = document.getElementById(a.id);
      const o = Array.from(s.options);
      const m = o.find(function (x) { return x.textContent.indexOf(a.txt) === 0; });
      if (m) { s.value = m.value; s.dispatchEvent(new Event('change')); return { picked: m.textContent, count: o.length }; }
      return { picked: null, list: o.map(function (x) { return x.textContent; }) };
    }, { id: id, txt: txt });
    await page.waitForTimeout(2500);
    return r;
  };

  const out = {};
  out.regions = await page.evaluate(function () {
    const s = document.getElementById('orgRegion');
    return Array.from(s.options).map(function (x) { return x.textContent; });
  });
  out.region = await pick('orgRegion', '虚拟区');
  out.area = await pick('orgArea', '上海一区');
  out.store = await pick('orgStore', '上海浦东旗舰店');
  out.posts = await page.evaluate(function () {
    const s = document.getElementById('orgPost');
    return { disabled: s.disabled, list: Array.from(s.options).map(function (x) { return { t: x.textContent, d: x.disabled }; }) };
  });
  out.persons = await page.evaluate(function () {
    const s = document.getElementById('orgPerson');
    return { total: s.options.length, list: Array.from(s.options).map(function (x) { return x.textContent; }).slice(0, 15) };
  });
  console.log('RESULT ' + JSON.stringify(out, null, 1));
  await page.screenshot({ path: 'D:/projects/dashboard/shot_v5.3_cascade.png' });
  return JSON.stringify(out);
}