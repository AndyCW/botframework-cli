/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {Recognizer} from './recognizer'
import {MultiLanguageRecognizer} from './multi-language-recognizer'
import {Settings} from './settings'
import {CognitiveServicesCredentials} from '@azure/ms-rest-azure-js'
import {LUISAuthoringClient} from '@azure/cognitiveservices-luis-authoring'
import * as path from 'path'
import fetch from 'node-fetch'
const retCode = require('./../utils/enums/CLI-errors')
const exception = require('./../utils/exception')
const Content = require('./../lu/lu')
const LUOptions = require('./../lu/luOptions')
const Luis = require('./../luis/luis')

export class LuBuildCore {
  private readonly client: any
  private readonly subscriptionKey: string
  private readonly endpoint: string

  constructor(subscriptionKey: string, endpoint: string) {
    this.subscriptionKey = subscriptionKey
    this.endpoint = endpoint

    // new luis api client
    const creds = new CognitiveServicesCredentials(subscriptionKey)
    this.client = new LUISAuthoringClient(creds, endpoint)
  }

  public async getApplicationList() {
    let apps = await this.client.apps.list(undefined, undefined)

    return apps
  }

  public async getApplicationInfo(appId: string) {
    let appInfo = await this.client.apps.get(appId)

    return appInfo
  }

  public async importApplication(currentApp: any): Promise<any> {
    // let response = await this.client.apps.importMethod(currentApp)

    const name = `?appName=${currentApp.name}`
    const url = this.endpoint + '/luis/authoring/v3.0-preview/apps/import' + name
    const headers = {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': this.subscriptionKey
    }

    const response = await fetch(url, {method: 'POST', headers, body: JSON.stringify(currentApp)})
    const messageData = await response.json()

    if (messageData.error) {
      throw (new exception(retCode.errorCode.LUIS_API_CALL_FAILED, messageData.error.message))
    }

    return messageData
  }

  public async exportApplication(appId: string, versionId: string) {
    const response = await this.client.versions.exportMethod(appId, versionId)

    return response
  }

  public compareApplications(currentApp: any, existingApp: any) {
    currentApp.desc = currentApp.desc && currentApp.desc !== '' && currentApp.desc !== existingApp.desc ? currentApp.desc : existingApp.desc
    currentApp.culture = currentApp.culture && currentApp.culture !== '' && currentApp.culture !== existingApp.culture ? currentApp.culture : existingApp.culture
    currentApp.versionId = currentApp.versionId && currentApp.versionId !== '' && currentApp.versionId > existingApp.versionId ? currentApp.versionId : existingApp.versionId;

    // convert list entities to remove synonyms word in list which is same with canonicalForm
    (currentApp.closedLists || []).forEach((c: any) => {
      (c.subLists || []).forEach((s: any) => {
        if (s.list) {
          const foundIndex = s.list.indexOf(s.canonicalForm)
          if (foundIndex > -1) {
            s.list.splice(foundIndex, 1)
          }
        }
      })
    })

    currentApp.name = existingApp.name

    existingApp.model_features = existingApp.phraselists
    delete existingApp.phraselists

    existingApp.regex_features = existingApp.regex_features
    delete existingApp.regex_features

    existingApp.regex_entities = existingApp.regex_entities
    delete existingApp.regex_entities

    return !this.isApplicationEqual(currentApp, existingApp)
  }

  public updateVersion(currentApp: any, existingApp: any) {
    let newVersionId: string
    if (currentApp.versionId > existingApp.versionId) {
      newVersionId = currentApp.versionId
    } else {
      newVersionId = this.updateVersionValue(existingApp.versionId)
    }

    currentApp.versionId = newVersionId

    return newVersionId
  }

  public async importNewVersion(appId: string, app: any, options: any) {
    // await this.client.versions.importMethod(appId, app, options)

    const versionId = `?versionId=${options.versionId}`
    let url = this.endpoint + '/luis/authoring/v3.0-preview/apps/' + appId + '/versions/import' + versionId
    const headers = {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': this.subscriptionKey
    }

    const response = await fetch(url, {method: 'POST', headers, body: JSON.stringify(app)})
    const messageData = await response.json()

    if (messageData.error) {
      throw (new exception(retCode.errorCode.LUIS_API_CALL_FAILED, messageData.error.message))
    }

    return messageData
  }

  public async listApplicationVersions(appId: string) {
    return this.client.versions.list(appId)
  }

  public async deleteVersion(appId: string, versionId: string) {
    await this.client.versions.deleteMethod(appId, versionId)
  }

  public async trainApplication(appId: string, versionId: string) {
    await this.client.train.trainVersion(appId, versionId)
  }

  public async getTrainingStatus(appId: string, versionId: string) {
    const status = this.client.train.getStatus(appId, versionId)

    return status
  }

  public async publishApplication(appId: string, versionId: string) {
    this.client.apps.publish(appId,
      {
        versionId,
        isStaging: false
      })
  }

  public generateDeclarativeAssets(recognizers: Array<Recognizer>, multiRecognizers: Array<MultiLanguageRecognizer>, settings: Array<Settings>)
    : Array<any> {
    let contents = new Array<any>()
    for (const recognizer of recognizers) {
      let content = new Content(recognizer.save(), new LUOptions(path.basename(recognizer.getDialogPath()), true, '', recognizer.getDialogPath()))
      contents.push(content)
    }

    for (const multiRecognizer of multiRecognizers) {
      const multiLangContent = new Content(multiRecognizer.save(), new LUOptions(path.basename(multiRecognizer.getDialogPath()), true, '', multiRecognizer.getDialogPath()))
      contents.push(multiLangContent)
    }

    for (const setting of settings) {
      const settingsContent = new Content(setting.save(), new LUOptions(path.basename(setting.getSettingsPath()), true, '', setting.getSettingsPath()))
      contents.push(settingsContent)
    }

    return contents
  }

  private updateVersionValue(versionId: string) {
    let numberVersionId = parseFloat(versionId)
    if (isNaN(numberVersionId)) {
      const index = versionId.lastIndexOf('-')
      if (index > 0) {
        const strVersion = versionId.substring(0, index)
        const numberVersion = versionId.substring(index + 1)
        numberVersionId = parseFloat(numberVersion)
        if (isNaN(numberVersionId)) {
          return versionId
        } else {
          const newVersionId = numberVersionId + 0.1

          return strVersion + '-' + newVersionId.toFixed(1)
        }
      } else {
        return versionId + '-0.1'
      }
    } else {
      return (numberVersionId + 0.1).toFixed(1)
    }
  }

  private async isApplicationEqual(appA: any, appB: any) {
    let appALu = (new Luis(appA)).parseToLuContent().toLowerCase()
    let appBLu = (new Luis(appB)).parseToLuContent().toLowerCase()
    
    return appALu === appBLu
  }
}
