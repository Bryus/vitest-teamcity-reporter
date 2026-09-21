import { escapeSpecials } from '../escape'

export type Parameters = { [key in string]: string | number }

export const generateParameters = (parameters: Parameters): string => {
  return Object.entries(parameters)
    .map(([key, value]) => `${key}='${escapeSpecials(value)}'`)
    .join(' ')
}

export const generateMessage = (type: string, parameters: Parameters): string => {
  return `##teamcity[${type} ${generateParameters(parameters)}]`
}

// https://www.jetbrains.com/help/teamcity/service-messages.html#Supported+Test+ServiceMessages
export abstract class Message {
  public constructor(
    protected id: string,
    protected name: string,
  ) {}

  protected abstract generate(type: string, parameters: Parameters): string

  protected generateParameters(parameters: Parameters): string {
    return generateParameters(parameters)
  }

  protected generateTeamcityMessage(type: string, flowId: string, parameters: Parameters): string {
    return generateMessage(type, { flowId, ...parameters })
  }
}
