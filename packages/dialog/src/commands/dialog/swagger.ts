/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { OpenAPI, OpenAPIV2 } from 'openapi-types';
import { Command, flags } from '@microsoft/bf-cli-command';
import * as gen from '../../library/dialogGenerator'
import * as ppath from 'path'
import * as fs from 'fs-extra'
import * as sw from 'swagger-parser';
import { setFlagsFromString } from 'v8';
import GenerateDialog from './generate';

export default class Swagger extends Command {
  static description = '[PREVIEW] Generate localized .lu, .lg, .qna and .dialog assets to define a bot based on a schema using templates.'

  static examples = [`
      $ bf dialog:generate sandwich.schema --output c:/tmp
    `]

  static args = [
    { name: 'path', required: true, description: 'test' },
  ]

  static flags: flags.Input<any> = {
    force: flags.boolean({ char: 'f', description: 'Force overwriting generated files.' }),
    help: flags.help({ char: 'h' }),
    locale: flags.string({ char: 'l', description: 'Locales to generate. [default: en-us]', multiple: true }),
    output: flags.string({ char: 'o', description: 'Output path for where to put generated .lu, .lg, .qna and .dialog files. [default: .]', default: '.', required: false }),
    schema: flags.string({ char: 's', description: 'Path to your app.schema file.', required: false }),
    templates: flags.string({ char: 't', description: 'Directory with templates to use for generating assets.', multiple: true }),
    verbose: flags.boolean({ description: 'Output verbose logging of files as they are processed', default: false }),
    route: flags.string({ char: 'r', description: 'Route to the specific api', required: true }),
    method: flags.string({ char: 'm', description: 'Method of the specific api.', required: true, default: 'GET' }),
    property: flags.string({ char: 'p', description: 'The property of the response to set in', required: true }),
  }

  async run() {
    const { args, flags } = this.parse(Swagger)
    try {
      let swfile = await sw.dereference(args.path) as OpenAPIV2.Document
      let uniqueName = swfile.info.title.toLowerCase().replace(' ', '_')
      let projectName = swfile.info.title.replace(' ', '_') + '.schema'
      let url = 'https://' + swfile.host as string + swfile.basePath as string + flags.route;
      let result = {
        $schema: 'http://json-schema.org/draft-07/schema',
        type: 'object',
        properties: {
        },
        required: new Array(),
        $requires: [
          'standard.schema'
        ],
        swaggerApi: url,
        swaggerMethod: flags.method,
        swaggerResponse: flags.property,
        swaggerBody: {}
      }
      let body = {}
      for (let param of swfile.paths[flags.route][flags.method].parameters) {
        if (param.type === 'integer') {
          result.properties[uniqueName + param.name] = {
            type: 'number',
            description: param.description,
            minimum: 1,
            maximum: 100
          }
        } else if (param.type === 'string') {
          result.properties[uniqueName + param.name] = {
            type: 'string',
            $entities: [
              'utterance'
            ],
            description: param.description
          }
        } else {
          result.properties[uniqueName + param.name] = {
            type: param.type,
            description: param.description
          }
        }
        body[param.name] = '$' + uniqueName + param.name;
        result.required.push(uniqueName + param.name)
      }
      result.swaggerBody = body;

      console.log(ppath.join(flags.output, projectName))
      await fs.ensureDir(flags.output)
      await fs.writeFile(ppath.join(flags.output, projectName), JSON.stringify(result, null, 4))

      let schemaName = ppath.join(flags.output, projectName)
      let outDir = flags.output
      if (!outDir) {
          outDir = ppath.join(schemaName + '-resources')
      }
      await gen.generate(schemaName, outDir, flags.schema, flags.locale, flags.templates, flags.force,
          (type, msg) => {
              if (type === gen.FeedbackType.message
                  || type === gen.FeedbackType.error
                  || (type === gen.FeedbackType.info && flags.verbose)) {
                  this.progress(msg)
              }
          })
      return true;
    } catch (e) {
      this.thrownError(e)
    }
  }

  thrownError(err: Error): void {
    this.error(err.message)
  }

  progress(msg: string): void {
    this.error(msg)
  }
}
