import {Har,
  Page,
  PageTimings,
  Creator,
  Cookie,
  Request,
  Content,
  Response,
  Timings,
  Entry
} from "../typing/har"
import TimeBlock from '../typing/time-block'
import {
  WaterfallData,
  Mark
} from '../typing/waterfall-data'
import {mimeToCssClass} from './styling-converters'


export default class HarTransformer{
  
  static transfrom(data: Har): WaterfallData {
    console.log("HAR created by %s(%s) of %s page(s)", data.creator.name, data.creator.version, data.pages.length)
    
    //temp - TODO: remove
    window["data"] = data

    //only support one page (first) for now
    const currentPageIndex = 0
    const currPage = data.pages[currentPageIndex]
    const pageStartTime = new Date(currPage.startedDateTime).getTime()
    const pageTimings = currPage.pageTimings

    let doneTime = 0;
    const blocks = data.entries
      .filter(entry => entry.pageref === currPage.id)
      .map((entry) => {
        const startRelative = new Date(entry.startedDateTime).getTime() - pageStartTime

        if (doneTime < (startRelative + entry.time)){
          doneTime = startRelative + entry.time
        }

        const subModules = entry.timings

        return new TimeBlock(entry.request.url, 
          startRelative,
          parseInt(entry._all_end) || (startRelative + entry.time),
          mimeToCssClass(entry.response.content.mimeType),
          this.buildDetailTimingBlocks(startRelative, entry),
          entry
        )
    })
    
    
    const marks = Object.keys(pageTimings)
      .filter(k => (pageTimings[k] != undefined && pageTimings[k] >= 0))
      .sort((a: string, b: string) => pageTimings[a] > pageTimings[b]? 1 : -1)
      .map(k => {
        const startRelative = pageTimings[k]
        
        return {
          "name": k.replace(/^[_]/, ""),
          "startTime": startRelative
        } as Mark
    })

    return {
      durationMs: doneTime,
      blocks: blocks,
      marks: marks,
      lines: [],
    }
  }

  private static getTimePair(key: string, entry: Entry, collect: Array<TimeBlock>, startRelative: number){
    let wptKey;
      switch(key){
        case "wait": wptKey = "ttfb"; break
        case "receive": wptKey = "download"; break
        default: wptKey = key
      }
      const preciseStart = parseInt(entry[`_${wptKey}_start`])
      const preciseEnd = parseInt(entry[`_${wptKey}_end`])
      const start = preciseStart || ((collect.length > 0) ? collect[collect.length - 1].end : startRelative)
      const end = preciseEnd || (start + entry.timings[key])
      
      return {
        "start": start,
        "end": end
      }
  }

  static buildDetailTimingBlocks(startRelative: number, entry: Entry): Array<TimeBlock> {
    var t = entry.timings
    // var timings = []
    return ["blocked", "dns", "connect", "send", "wait", "receive"].reduce((collect: Array<TimeBlock>, key) => {
      
      const time = this.getTimePair(key, entry, collect, startRelative)
      
      if (time.end && time.start >= time.end){
        return collect
      }
      
      //special case for 'connect' && 'ssl' since they share time
      //http://www.softwareishard.com/blog/har-12-spec/#timings
      if (key === "connect" && t["ssl"] && t["ssl"] !== -1){
        const sslStart = parseInt(entry[`_ssl_start`]) || time.start
        const sslEnd = parseInt(entry[`_ssl_end`]) || time.start + t.ssl
        const connectStart = (!!parseInt(entry[`_ssl_start`])) ? time.start : sslEnd
        return collect
          .concat([new TimeBlock("ssl", sslStart, sslEnd, "block-ssl")])
          .concat([new TimeBlock(key, connectStart, time.end, "block-" + key)])
      }

      return collect.concat([new TimeBlock(key, time.start, time.end, "block-" + key)])
      
    }, [])
  }
}