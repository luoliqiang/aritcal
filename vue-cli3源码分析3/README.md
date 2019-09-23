#### vue-cli 3.0的源码解析-（3）入口文件create文件
进入到**create.js**文件下，还是一步一步分析代码
```js
const fs = require('fs-extra')
const path = require('path')
const chalk = require('chalk')
const inquirer = require('inquirer')
const Creator = require('./Creator')
const { clearConsole } = require('./util/clearConsole')
const { getPromptModules } = require('./util/createTools')
const { error, stopSpinner, exit } = require('@vue/cli-shared-utils')
const validateProjectName = require('validate-npm-package-name')

async function create (projectName, options) {
  // 传入了代理参数则在系统环境变量中设置临时变量HTTP_PROXY为proxy
  if (options.proxy) {
    process.env.HTTP_PROXY = options.proxy
  }
  //node命令执行文件夹
  const cwd = options.cwd || process.cwd()
  //projectName为.则在该目录下创建项目
  const inCurrent = projectName === '.'
  // 在当前目录下则将文件夹名作为name，../为执行vue的文件夹上层，它和cwd的相对路径就是该文件夹
  const name = inCurrent ? path.relative('../', cwd) : projectName
  // 解析出绝对路径projectName为.则为cwd，否则为cwd+projectName
  const targetDir = path.resolve(cwd, projectName || '.')
  // 校验是否是规范的npm包名，npm包名不能有大写字母，不超过214字符，不能有空格，：等规范
  // 所以输入vue create ddD
  // Invalid project name: "ddD"
  // Warning: name can no longer contain capital letters
  const result = validateProjectName(name)
  if (!result.validForNewPackages) {
    console.error(chalk.red(`Invalid project name: "${name}"`))
    result.errors && result.errors.forEach(err => {
      console.error(chalk.red.dim('Error: ' + err))
    })
    result.warnings && result.warnings.forEach(warn => {
      console.error(chalk.red.dim('Warning: ' + warn))
    })
    // exit会调用process.exit,如果是dubug模式，会在node中打印错误信息
    exit(1)
  }
  // 同步判断文件夹是否存在
  if (fs.existsSync(targetDir)) {
    if (options.force) {
      // 同步移除
      await fs.remove(targetDir)
    } else {
      // 清屏，打印出升级信息
      await clearConsole() 
      if (inCurrent) {
        const { ok } = await inquirer.prompt([
          {
            name: 'ok',
            type: 'confirm',
            message: `Generate project in current directory?`
          }
        ])
        if (!ok) {
          return
        }
      } else {
        // 是否重写或者合并，取消
        const { action } = await inquirer.prompt([
          {
            name: 'action',
            type: 'list',
            message: `Target directory ${chalk.cyan(targetDir)} already exists. Pick an action:`,
            choices: [
              { name: 'Overwrite', value: 'overwrite' },
              { name: 'Merge', value: 'merge' },
              { name: 'Cancel', value: false }
            ]
          }
        ])
        if (!action) {
          return
        } else if (action === 'overwrite') {
          console.log(`\nRemoving ${chalk.cyan(targetDir)}...`)
          // 移除文件夹
          await fs.remove(targetDir)
        }
      }
    }
  }
  cli.onPromptComplete((answers, options) => {
  cli.onPromptComplete((answers, options) => {
  // 实例化 Creator 传入name,生成目录，和一些辅助函数的数组，辅助函数中会向vue-cli注入injectFeature和onPromptComplete参数
  // onPromptComplete为用户对提示做出的答案，injectFeature为插入参数
  const creator = new Creator(name, targetDir, getPromptModules())
  // 掉用creator方法
  await creator.create(options)
}

module.exports = (...args) => {
  return create(...args).catch(err => {
    stopSpinner(false) // do not persist
    error(err)
    if (!process.env.VUE_CLI_TEST) {
      process.exit(1)
    }
  })
}

```
#### 总结
create为cli的主要执行文件，会处理一些文件夹名和目标目录以及用户确认命令的一些操作，主要步骤：
* 判断是否输入.在当前目录创建projectName，并且生成目标目录的绝对路径targetDir
* 判断项目名是否符合npm包规则
* 如果文件夹重名。promp让用户选择是否覆盖
* 调用Creator实例化，并且调用create方法

接下来分析creator构造函数


  

