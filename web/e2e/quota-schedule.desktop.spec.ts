import {test,expect} from "./fixtures";
import {MOCK_URL} from "./env";

test("quota schedules: dedicated tab, server preview, persistence and mobile layouts",async({page,login},testInfo)=>{
  test.setTimeout(90000);
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  const created=await page.request.post(MOCK_URL+"/v1/users",{data:{username:"schedule-test",data_quota_bytes:1500000}});expect(created.status()).toBe(201);
  await login();const before=await(await page.request.get("/api/users")).json();
  await page.getByRole("button",{name:"Действия со списком",exact:true}).click();
  await page.getByRole("link",{name:/Расписание сбросов/}).click();
  await expect(page.getByRole("heading",{name:"Расписание сбросов",exact:true})).toBeVisible();
  for(const width of [320,390,768,1280,2560]){
    await page.setViewportSize({width,height:1000});await expect(page.locator(".qs-preview li")).toHaveCount(3);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({path:testInfo.outputPath(`schedule-global-${width}.png`),fullPage:true});
  }
  await page.getByRole("switch",{name:"Общее расписание",exact:true}).check();
  await page.getByLabel("Дата первого запуска",{exact:true}).fill("2099-01-01");
  await page.getByRole("button",{name:"7 дней",exact:true}).click();
  const save=page.getByRole("button",{name:"Сохранить расписание",exact:true}),saved=page.locator(".qs-save [role=status]");await expect(save).toBeEnabled();await save.click();await expect(saved).toContainText("Расписание сохранено");
  await page.reload();await expect(page.getByRole("switch",{name:"Общее расписание",exact:true})).toBeChecked();await expect(page.getByLabel("Количество дней",{exact:true})).toHaveValue("7");
  await page.getByLabel("Количество дней",{exact:true}).fill("8");await page.getByRole("link",{name:"К списку пользователей",exact:true}).click();await expect(page.getByRole("dialog",{name:"Отменить изменения?"})).toBeVisible();await page.getByRole("button",{name:"Остаться",exact:true}).click();
  const concurrent=await(await page.request.get("/api/settings/quota-schedule")).json();expect((await page.request.put("/api/settings/quota-schedule",{headers:{"If-Match":concurrent.revision,"Sec-Fetch-Site":"same-origin"},data:{...concurrent.global,rule:{...concurrent.global.rule,days:14}}})).ok()).toBeTruthy();
  await save.click();await expect(page.getByRole("alert")).toContainText("Расписание изменилось");await page.getByRole("button",{name:"Загрузить актуальные настройки"}).click();await expect(page.getByLabel("Количество дней",{exact:true})).toHaveValue("14");
  await page.goto("/people/schedule-test?tab=schedule");await page.setViewportSize({width:390,height:900});
  await expect(page.getByRole("button",{name:"Автосброс",exact:true})).toHaveAttribute("aria-current","page");
  const tab=await page.getByRole("button",{name:"Автосброс",exact:true}).boundingBox();expect(tab!.x).toBeGreaterThanOrEqual(0);expect(tab!.x+tab!.width).toBeLessThanOrEqual(390);
  await expect(page.locator(".user-inline-form")).toHaveCount(0);
  await page.getByRole("radio",{name:/Своё расписание/}).check();
  await page.getByRole("button",{name:"Cron",exact:true}).click();
  await page.getByLabel("Cron-выражение",{exact:true}).fill("@daily");await expect(page.getByRole("alert")).toContainText("Проверьте интервал");await expect(save).toBeDisabled();
  await page.getByLabel("Cron-выражение",{exact:true}).fill("0 0 1 * *");await expect(page.locator(".qs-preview li")).toHaveCount(3);await save.click();await expect(saved).toContainText("Расписание сохранено");
  await page.reload();await expect(page.getByRole("radio",{name:/Своё расписание/})).toBeChecked();await expect(page.getByLabel("Cron-выражение",{exact:true})).toHaveValue("0 0 1 * *");
  await page.screenshot({path:testInfo.outputPath("schedule-user-390.png"),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole("radio",{name:/Отключить/}).check();await save.click();await expect(saved).toContainText("Расписание сохранено");await expect(page.getByRole("heading",{name:"Автоматический сброс не запланирован"})).toBeVisible();
  const after=await(await page.request.get("/api/users")).json();const pick=(items:Array<{username:string;data_quota_bytes:number}>)=>items.find(u=>u.username==="schedule-test")?.data_quota_bytes;expect(pick(after)).toEqual(pick(before));
  const common=await(await page.request.get("/api/settings/quota-schedule")).json();const reset=await page.request.put("/api/settings/quota-schedule",{headers:{"If-Match":common.revision,"Sec-Fetch-Site":"same-origin"},data:{...common.global,enabled:false}});expect(reset.ok()).toBeTruthy();
  expect(errors).toEqual([]);
});
