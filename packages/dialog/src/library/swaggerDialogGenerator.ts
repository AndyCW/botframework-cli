/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { OpenAPIV2 } from 'openapi-types';
import * as ppath from 'path'
import * as fs from 'fs-extra'
import * as sw from 'swagger-parser';

export enum FeedbackType {
  message,
  info,
  warning,
  error
}

export type Feedback = (type: FeedbackType, message: string) => void

// generate the parameter of the http request step
function generateParam(obj: any) {
  switch (obj.type) {
    case 'object':
      // todo: handle complex scenarios
      return undefined
    case 'integer':
      return {
        type: 'number',
        description: obj.description
      }
    case 'string':
      return {
        type: 'string'
      }
    case 'array':
      // todo: handle arry
      return undefined
    case 'boolean':
      return {
        type: 'boolean'
      }
  }
}

function generateJsonSchema() {
  return {
    $schema: 'http://json-schema.org/draft-07/schema',
    type: 'object',
    properties: {
    },
    required: new Array(),
    $requires: [
      'http.schema'
    ]
  }
}

function generateJsonProperties(url: string, method: string, property: string) {
  return {
    swaggerApi: url,
    swaggerMethod: method,
    swaggerResponse: property,
    swaggerBody: {},
    oauth: false
  }
}

export async function generate(
  path: string,
  output: string,
  method: string,
  route: string,
  property: string,
  projectName: string,
  feedback: Feedback) {

  // need to dereference the swagger file
  let swfile = await sw.dereference(path) as OpenAPIV2.Document
  await fs.remove(output)
  await fs.ensureDir(output)

  let protocol = swfile.schemes ? `${swfile.schemes[0]}://` : 'http://';

  // the name of output schema file to be used in dialogGenerator
  let url = protocol + swfile.host as string + swfile.basePath as string + route;

  // make url valid to the http request action
  url = `${url.replace('{', '@{$')}?`

  // the output schema file structure, pass the swagger related param in
  let result = generateJsonSchema()
  let jsonProperties = generateJsonProperties(url, method, property)
  let body = {}
  for (let param of swfile.paths[route][method].parameters) {
    if (param.type === undefined) {
      if (param.schema !== undefined && param.schema.properties !== undefined) {
        let subBody = {}
        for (let subParam in param.schema.properties) {
          let subVal = param.schema.properties[subParam]
          let subGenerated = generateParam(subVal)
          if (subGenerated) {
            result.properties[subParam] = generateParam(subVal)
            subBody[subParam] = '{$' + subParam + '}'
            result.required.push(subParam)
          }
        }
        body[param.name] = subBody
      }
    } else {
      if (param.in == "query") {
        if (url.endsWith('?')) {
          url = url + param.name + "=@{$" + param.name + "}"
        }
        else {
          url = url + '&' + param.name + "=@{$" + param.name + "}"
        }
      } else {
        body[param.name] = '{$' + param.name + '}'
      }
      result.properties[param.name] = generateParam(param)
      result.required.push(param.name)
    }
  }

  if (swfile.securityDefinitions !== undefined) {
    for (let security of swfile.paths[route][method].security) {
      for (let key in security) {
        if (swfile.securityDefinitions[key]?.type === 'oauth2') {
          // currently only support oauth in botbuilder
          jsonProperties.oauth = true
        }
      }
    }
  }


  jsonProperties.swaggerApi = url;
  jsonProperties.swaggerBody = body;
  let propertiesFile = ppath.join(output, `properties.json`)

  feedback(FeedbackType.info, `Output Dirctory: ${ppath.join(output, projectName)}`);
  feedback(FeedbackType.info, `Output Schema ${ppath.join(output, projectName)}`);
  feedback(FeedbackType.info, `Output Json Properties ${propertiesFile}`);

  await fs.ensureDir(output)
  await fs.writeFile(ppath.join(output, projectName), JSON.stringify(result, null, 4))
  await fs.writeFile(propertiesFile, JSON.stringify(jsonProperties, null, 4))
}

