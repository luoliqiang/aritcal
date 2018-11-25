## mockjs的使用
### 前言
最近在开发公司的大数据项目，涉及到页面基本都是数据图表格式，可以说是没数据就没法开发，但是偏偏遇上前后端开发时间错位，设后面项目紧接的状态；没办法前端要独立设计和后端开发了，找来**mockjs**数据模拟神器，前端配置好数据结构就好，**mockjs**会按照你想要的样子返回数据给你，这样前端可以用模拟的借口数据走完所有逻辑，后续只需要和后端协商数据接口接口，做些微调即可，也可以前端按照后端提供的接口文档进行对应的数据模拟即可，这样可以大大节约前后端调试的时间，怎么样，听起来是不是很美好？

**前端模拟数据常用的做法：**
* **模拟数据直接写死在页面**
    缺点：数据在业务代码层面造成代码混乱；数据写死无法模拟随机变化的数据；无法完成正常的接口模拟和逻辑。
* **前端手动启动服务器添加接口**
    缺点：需要单独启服务器；数据写死无法模拟随机变化的数据

**让我们再看看[mockjs官网](http://mockjs.com/)对其性能的介绍：**
* **前后端分离**
    让前端攻城师独立于后端进行开发。
* **增加单元测试的真实性**
    通过随机数据，模拟各种场景
* **开发无侵入**
    不需要修改既有代码，就可以拦截 Ajax 请求，返回模拟的响应数据
* **用法简单**
    符合直觉的接口
* **数据类型丰富**
    支持生成随机的文本、数字、布尔值、日期、邮箱、链接、图片、颜色等
* **方便扩展**
    支持支持扩展更多数据类型，支持自定义函数和正则

看起来很对胃口的样子，我们来看看它具体的用法吧。
## 使用
### 安装

```js
# 安装
npm install mockjs
```
```js
# 使用
let Mock = require('mockjs')
var data = Mock.mock({
    // 属性 list 的值是一个数组，其中含有 1 到 10 个元素
    'list|1-10': [{
        // 属性 id 是一个自增数，起始值为 1，每次增 1
        'id|+1': 1
    }]
})
// 输出结果
console.log(JSON.stringify(data, null, 4))
```
安装和使用就是这么简单，此时mock会去**接管**我们的**接口请求**，返回我们自定义的数据，更多的安装方法请查看[官方文档-安装](https://github.com/nuysoft/Mock/wiki/Getting-Started)
## 语法
mockjs主要含有以下几个方法 
* **Mock.mock**
* **Mock.setup**
* **Mock.Random**
* **Mock.valid**
* **Mock.toJSONSchema**
其中**方法Mock.mock( rurl?, rtype?, template|function( options ) )为其核心方法**，该方法可以传入一个数据模版生成数据，并且可以传入url等，对ajax请求进行拦截（内部原理是重写了XMLHttpRequest）方法。
eg:
```js
Mock.mock('hello.json','get', {
    code: 0,
    data: {
        'txt': 'hello',
        'num|1-100': 30
    }
})
$.ajax({
    url: 'hello.json',
    type: 'GET'
})
.done(function(res) {
    console.log(res.data);
})
//输出结果：
{
    txt: 'hello',
    num: 45
}
```
例子中可以看到mock最开始是调用mock方法构建了一个假数据，接下来的ajax请求地址正好对应mock中的url参数，这个时候mock就会对该请求进行接管，返回我们自定义的数据，对于数据中的num返回45是由于在进行数据模版的编写时mock提供了多种数据编写格式来方便我们进行数据的创造。

**mockjs中设置的数据格式为key-walue的json格式，其语法规范包括两部分：**
1. 数据模板定义规范（Data Template Definition，DTD）
2. 数据占位符定义规范（Data Placeholder Definition，DPD）

### 数据模板定义规范
**数据模板中的每个属性由 3 部分构成：属性名、生成规则、属性**
```js
// 属性名   name
// 生成规则 rule
// 属性值   value
'name|rule': value
```
例如： 
```js
'age|1-80':10
// age: 32
// 将会生成属性为age,值为1-80的随机数字
```
注意：
* 属性名 和 生成规则 之间用竖线 | 分隔。
* 生成规则 是可选的。
* 生成规则 有 7 种格式：
'name|min-max': value
'name|count': value
'name|min-max.dmin-dmax': value
'name|min-max.dcount': value
'name|count.dmin-dmax': value
'name|count.dcount': value
'name|+step': value
* **生成规则 的 含义 需要依赖 属性值的类型 才能确定。**
* 属性值 中可以含有 @占位符。
* 属性值 还指定了最终值的初始值和类型。

其中第四点说明生成规则是和属性的值的类型有关系的，例如生成一个最小和最大值之间的值时，如果属性值的类型时数字则生成该范围的数字大小，如果是字符串，则生成指定长度的字符串。
eg:
```js
'from|1-10': 5
// 7 1-10大小的随机数字
'from|1-10': 'abc'
// 'dedga' 1-10长度的随机字符串
```
属性值的初始值可以有多种用途，既可能作为生成规则+1的初始值也可以仅仅作为其他类型生成规则的类型判断。
官方对其使用有非常详细的讲解，在此不做详细的概述，对只对其部分容易混淆的地方进行分析。

**`'name|+1': array`** **从属性值 array 中顺序选取 1 个元素，作为最终值。**
属性值是数组 Array的语法中 `'name|+1': array` 代表从数组中按顺序选择1个元素，作为最终值，意味着对一个数据接口发送多次请求，该mock数据结构会记住该数组当前获取的index坐标值并且返回，如果index值超过数组长度，那么会循环往复获取数组值.
```js
Mock.mock('api/getList', 'get', {
    code: 0,
    data {
        'list|+1': [1,2,3]
    }
})
ajax.('api/getList')
ajax.('api/getList')
ajax.('api/getList')
ajax.('api/getList')
...
// 输出 1,2,3,1...
```

**'name': function** **属性值是函数 Function**
执行函数 function，取其返回值作为最终的属性值，函数的上下文(this)为属性 'name' 所在的对象。
例如我们需要模拟一个男女比例的随机数据，这时候就可以用function
eg:
```js
{
    'male|40-60': 50,
    'female': function() {
        return 100 - this.male
    }
}
//male: 43 female 67
```
**属性值是正则表达式 RegExp**
可以用正则表达式来实现一些常用的特定格式的数据，例如生成电话号码，身份证号等

```js\
{
    'phone': /\d{5,11}/,
    'charatar': /[a-z][A-Z][0-9]/,
}
// 15908121622 pJ7
```
### 数据占位符定义规范 DPD
占位符 只是在属性值字符串中占个位置，并不出现在最终的属性值中。

占位符 的格式为：
```js
@占位符
@占位符(参数 [, 参数])
```
注意：

1. 用 @ 来标识其后的字符串是 占位符。
2. 占位符 引用的是 Mock.Random 中的方法。
3. 通过 Mock.Random.extend() 来扩展自定义占位符。
4. 占位符 也可以引用 数据模板 中的属性。
5. 占位符 会优先引用 数据模板 中的属性。
6. 占位符 支持 相对路径 和 绝对路径。
```js 
Mock.mock({
    name: {
        first: '@FIRST',
        middle: '@FIRST',
        last: '@LAST',
        full: '@first @middle @last'
    }
})
// =>
{
    "name": {
        "first": "Charles",
        "middle": "Brenda",
        "last": "Lopez",
        "full": "Charles Brenda Lopez"
    }
}
```

### Mock.setup( settings )方法
该方法只有一个用法，就是设置ajax请求的timeout设置，不过该timeout不是指超时时间，而是指响应时间，这样可以模拟一些弱网，或3g网络情况。
```js
Mock.setup({
    timeout: 400
})
Mock.setup({
    timeout: '200-600'//介于200-600ms之间
})
```
### Mock.Random方法
mockjs提供的数据处理工具集，能随机生成时间，图片，链接等数据。
mock.Random可以单独调用，也可以作为数据模版的**占位符**`
* Mock.Random
    * Basic
    * Date
    * Image
    * Color
    * Text
    * Name
    * Web
    * Address
    * Helper
    * Miscellaneous

以下是一些常用方法，详细用法参考[官方文档](https://github.com/nuysoft/Mock/wiki/Mock.Random)

Random.date
```js
Mock.Random.date('yyyy-MM-dd')
// 2018-06-11
{
    'date': '@date(yyyy-MM-dd)'
}
//1988-11-12
```
Random.image 生成图片也是很实用简单的，可以生存图片url,也可以生成base64：
```js
{
    'imageSrc': '@image(300x140)',
    //图片URL http://dummyimage.com/300*140
}
{
    'image': '@dataImage'
    // base64图片格式
}
```
Random.paragraph( min?, max? )生成文字段落
```js
Random.paragraph()
// => "Yohbjjz psxwibxd jijiccj kvemj eidnus disnrst rcconm bcjrof tpzhdo ncxc yjws jnmdmty. Dkmiwza ibudbufrnh ndmcpz tomdyh oqoonsn jhoy rueieihtt vsrjpudcm sotfqsfyv mjeat shnqmslfo oirnzu cru qmpt ggvgxwv jbu kjde. Kzegfq kigj dtzdd ngtytgm comwwoox fgtee ywdrnbam utu nyvlyiv tubouw lezpkmyq fkoa jlygdgf pgv gyerges wbykcxhwe bcpmt beqtkq. Mfxcqyh vhvpovktvl hrmsgfxnt jmnhyndk qohnlmgc sicmlnsq nwku dxtbmwrta omikpmajv qda qrn cwoyfaykxa xqnbv bwbnyov hbrskzt. Pdfqwzpb hypvtknt bovxx noramu xhzam kfb ympmebhqxw gbtaszonqo zmsdgcku mjkjc widrymjzj nytudruhfr uudsitbst cgmwewxpi bye. Eyseox wyef ikdnws weoyof dqecfwokkv svyjdyulk glusauosnu achmrakky kdcfp kujrqcq xojqbxrp mpfv vmw tahxtnw fhe lcitj."
    
Random.paragraph(2)
// => "Dlpec hnwvovvnq slfehkf zimy qpxqgy vwrbi mok wozddpol umkek nffjcmk gnqhhvm ztqkvjm kvukg dqubvqn xqbmoda. Vdkceijr fhhyemx hgkruvxuvr kuez wmkfv lusfksuj oewvvf cyw tfpo jswpseupm ypybap kwbofwg uuwn rvoxti ydpeeerf."
    
Random.paragraph(1, 3)
// => "Qdgfqm puhxle twi lbeqjqfi bcxeeecu pqeqr srsx tjlnew oqtqx zhxhkvq pnjns eblxhzzta hifj csvndh ylechtyu."
```
Random.word( min?, max? )生成单词
```js
Random.word()
// => "fxpocl"
Random.word(5)
// => "xfqjb"
Random.word(3, 5)
// => "kemh"
```
Random.cword 生成汉字
```js
Random.cword()
// => "干"
```
Random.cname 生成中文名
```js
Random.cname()
// => "袁军"
```
Random.url( protocol?, host? ) 生成url
```js
Random.url('http', 'nuysoft.com')
// => "http://nuysoft.com/ewacecjhe"
```
Random.province() 生成省份
Random.city( prefix? ) 生成市
Random.county( prefix? ) 生成县
其中的**prefix**参数代表是否同时生成上级区县名称，只有市和县才有该参数，分别对应上级的省份和市，eg:
```js
Random.province()
// => "黑龙江省"

Random.city()
// => "唐山市"
Random.city(true)
// => "福建省 漳州市"

Random.county()
// => "上杭县"
Random.county(true)
// => "甘肃省 白银市 会宁县"
```
**Random还提供了一些常用的特殊数据格式：**
Random.guid() 随机生成一个 GUID
```js
Random.guid()
// => "662C63B4-FD43-66F4-3328-C54E3FF0D56E"
```
Random.id() 随机生成一个 18 位身份证
```js
Random.id()
// => "420000200710091854"
```
**一些常用的方法也放在random中**
Random.capitalize(word) 把字符串的第一个字母转换为大写
Random.upper( str ) 把字符串转换为大写
Random.lower( str ) 把字符串转换为小写
Random.pick( arr ) 从数组中随机选取一个元素，并返回
```js
Random.pick(['a', 'e', 'i', 'o', 'u'])
// => "o"
```
Random.shuffle( arr ) 打乱数组中元素的顺序，并返回
```js
Random.shuffle(['a', 'e', 'i', 'o', 'u'])
// => ["o", "u", "e", "i", "a"]
```
**Mock.valid()**方法用于比较模拟数据和真实数据是否一致
Mock.valid( template, data )
eg:
```js
var template = {
    name: 'value1'
}
var data = {
    name: 'value2'
}
Mock.valid(template, data)
// =>
[
    {
        "path": [
            "data",
            "name"
        ],
        "type": "value",
        "actual": "value2",
        "expected": "value1",
        "action": "equal to",
        "message": "[VALUE] Expect ROOT.name'value is equal to value1, but is value2"
    }
]
```
**Mock.toJSONSchema()** 
把 Mock.js 风格的数据模板 template 转换成 JSON Schema,不是很常用。