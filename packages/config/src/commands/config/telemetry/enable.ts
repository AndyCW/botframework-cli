import {Command, flags} from '@oclif/command'
const fs = require('fs-extra')
const path = require('path')

export default class ConfigTelemetryEnable extends Command {
  static description = 'Enable Telemetry'

  static flags = {
    help: flags.help({char: 'h'}),
  }

  async run() {
    const userConfig = await fs.readJSON(path.join(this.config.configDir, 'config.json'))
    userConfig.telemetry = true
    await fs.writeFile(path.join(this.config.configDir, 'config.json'), JSON.stringify(userConfig, null, 2))
    this.log('Telemetry has been enabled.')
  }
}
