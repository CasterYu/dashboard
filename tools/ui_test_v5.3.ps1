# v5.3 浏览器实测：E90001 登录 → 虚拟区全链路五级下拉验证
$env:NODE_OPTIONS = ''
$env:PATH = 'C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-2;D:\java\node_js_package;' + $env:PATH
$cli = 'D:\java\node_js_package\playwright-cli.cmd'

& $cli open 'http://127.0.0.1:8123/index.html?data=api&api=http://127.0.0.1:3777'
Start-Sleep -Seconds 3
& $cli fill '#loginEmpNo' 'E90001'
& $cli click '#loginSubmit'
Start-Sleep -Seconds 4
& $cli screenshot 'D:\projects\dashboard\shot_v5.3_login.png'

# 大区选「虚拟区」
& $cli eval "(()=>{const s=document.getElementById('orgRegion');const o=[...s.options].map(x=>x.textContent);s.value=[...s.options].find(x=>x.textContent==='虚拟区')?.value;s.dispatchEvent(new Event('change'));return JSON.stringify({regions:o,region:s.value})})()"
Start-Sleep -Seconds 2
# 小区选「上海一区」（应在虚拟1区之下）
& $cli eval "(()=>{const s=document.getElementById('orgArea');const o=[...s.options].map(x=>x.textContent);const t=o.find(x=>x==='上海一区');if(t)s.value=[...s.options].find(x=>x.textContent==='上海一区').value;s.dispatchEvent(new Event('change'));return JSON.stringify({areas:o,picked:t||null})})()"
Start-Sleep -Seconds 2
# 门店选「上海浦东旗舰店」
& $cli eval "(()=>{const s=document.getElementById('orgStore');const o=[...s.options].map(x=>x.textContent);const t=o.find(x=>x==='上海浦东旗舰店');if(t)s.value=[...s.options].find(x=>x.textContent==='上海浦东旗舰店').value;s.dispatchEvent(new Event('change'));return JSON.stringify({stores:o,picked:t||null})})()"
Start-Sleep -Seconds 2
# 岗位下拉选项（应为 8 岗位名，非全灰、无重复旧名）
& $cli eval "(()=>{const s=document.getElementById('orgPost');return JSON.stringify({posts:[...s.options].map(x=>({t:x.textContent,d:x.disabled})),disabled:s.disabled})})()"
# 人员下拉选项（应为人名）
& $cli eval "(()=>{const s=document.getElementById('orgPerson');return JSON.stringify({persons:[...s.options].map(x=>x.textContent).slice(0,20),total:s.options.length})})()"
& $cli screenshot 'D:\projects\dashboard\shot_v5.3_cascade.png'
# console 错误
& $cli console
