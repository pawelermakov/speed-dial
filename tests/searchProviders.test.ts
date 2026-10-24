import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseTextSuggestions, parseImdbSuggestions, parseKinopoiskSuggestions, parseMyShowsSuggestions, providerSuggestions, searchProviders, searchUrl, suggestionRequest } from '../services/searchProviders';
import { validateSettings } from '../services/validation';
import { parseImport, serializeExport } from '../services/importExport';
import { defaults, type SearchProviderId } from '../types/models';
const fixture=(name:string)=>JSON.parse(readFileSync(new URL('./fixtures/search-providers/'+name+'.json',import.meta.url),'utf8'));
vi.mock('../services/kinopoiskNetwork',()=>({prepareKinopoiskNetwork:vi.fn(async()=>{})}));
afterEach(()=>vi.unstubAllGlobals());
describe('provider contracts',()=>{
  it('retries only a transient Kinopoisk GraphQL error once within the same deadline',async()=>{
    const transient=()=>new Response(JSON.stringify({errors:[{extensions:{code:'InternalServerError'}}],data:{suggest:{top:null}}}),{headers:{'content-type':'application/json'}});
    const fetchMock=vi.fn().mockResolvedValueOnce(transient()).mockResolvedValueOnce(new Response(JSON.stringify(fixture('kinopoisk')),{headers:{'content-type':'application/json'}}));
    vi.stubGlobal('fetch',fetchMock);
    expect((await providerSuggestions('kinopoisk','Матрица',new AbortController().signal))[0]?.id).toBe('301');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![1].signal).toBe(fetchMock.mock.calls[1]![1].signal);
    fetchMock.mockReset().mockImplementation(async()=>transient());
    await expect(providerSuggestions('kinopoisk','Матрица',new AbortController().signal)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockReset().mockResolvedValueOnce(new Response('',{status:403}));
    await expect(providerSuggestions('kinopoisk','Матрица',new AbortController().signal)).rejects.toThrow('HTTP 403');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('has web providers and a local bookmark mode and safe export defaults',async()=>{
    expect(searchProviders.map(row=>row.label)).toEqual(['Яндекс','Google','Закладки','Кинопоиск','IMDb','MyShows']);
    expect(validateSettings({}).searchProvider).toBe('yandex');expect(()=>validateSettings({searchProvider:'unsupported'})).toThrow('источник поиска');
    for(const {id}of searchProviders){const data={entries:[],settings:{...defaults,movieSearch:true,searchProvider:id},background:null};expect(parseImport(await serializeExport(data)).settings!.searchProvider).toBe(id);}
  });
  it.each(searchProviders.filter((row): row is {id:Exclude<SearchProviderId,'bookmarks'>;label:string}=>row.id!=='bookmarks'))('encodes queries for $id on its own official search page',({id})=>{
    const query='привет мир & C++ / ? #';const url=new URL(searchUrl(id,query));
    expect(url.protocol).toBe('https:');expect([...url.searchParams.values()]).toContain(query);
    expect(url.hostname).toBe({yandex:'www.yandex.ru',google:'www.google.com',kinopoisk:'www.kinopoisk.ru',imdb:'www.imdb.com',myshows:'myshows.me'}[id]);
  });
  it('parses real text suggestions without executing markup',()=>{
    expect(parseTextSuggestions(fixture('yandex')).length).toBeGreaterThan(0);
    expect(parseTextSuggestions(fixture('google')).length).toBeGreaterThan(0);
    expect(parseTextSuggestions(['q',['a','a',3,'<img src=x onerror=x>']])).toEqual([{id:'a',label:'a'},{id:'<img src=x onerror=x>',label:'<img src=x onerror=x>'}]);
    expect(()=>parseTextSuggestions({})).toThrow();
  });
  it('parses real catalogue IDs, titles and years with constructed official URLs',()=>{
    expect(parseImdbSuggestions(fixture('imdb'))[0]).toMatchObject({id:'tt0133093',label:'The Matrix',targetUrl:'https://www.imdb.com/title/tt0133093/'});
    expect(parseKinopoiskSuggestions(fixture('kinopoisk'))[0]).toMatchObject({id:'301',label:'Матрица',subtitle:'1999 · фильм',targetUrl:'https://www.kinopoisk.ru/film/301/'});
    expect(parseMyShowsSuggestions(fixture('myshows'))[0]).toMatchObject({id:'187',targetUrl:'https://myshows.me/view/187/'});
  });
  it('rejects foreign/malformed IDs and ignores supplied destination URLs',()=>{
    const rows=parseImdbSuggestions({q:'q',d:[{id:'tt0133093',l:'Matrix',url:'https://evil.example/'},{id:'https://evil.example/',l:'Bad'},{id:'nm0000206',l:'Keanu Reeves'},{id:'tt1/../evil',l:'Bad'}]});
    expect(rows.map(row=>row.targetUrl)).toEqual(['https://www.imdb.com/title/tt0133093/','https://www.imdb.com/name/nm0000206/']);
    expect(parseMyShowsSuggestions({jsonrpc:'2.0',result:[{id:-1,title:'Bad'},{id:'187',title:'Bad'},{id:187,title:'Good',url:'javascript:alert(1)'}]})).toEqual([{id:'187',label:'Good',subtitle:'сериал',targetUrl:'https://myshows.me/view/187/'}]);
    expect(parseKinopoiskSuggestions({data:{suggest:{top:{movies:[{movie:{id:1,title:{russian:'Bad'},__typename:'Person'}}]}}}})).toEqual([]);
  });
  it('accepts empty results but rejects malformed envelopes and limits labels/results',()=>{
    expect(parseImdbSuggestions({q:'nothing'})).toEqual([]);expect(parseMyShowsSuggestions({jsonrpc:'2.0',result:[]})).toEqual([]);
    for(const parse of [parseImdbSuggestions,parseKinopoiskSuggestions,parseMyShowsSuggestions])expect(()=>parse({error:true})).toThrow();
    expect(parseTextSuggestions(['q',Array.from({length:20},(_,i)=>'Result '+i)])).toHaveLength(8);
    expect(parseTextSuggestions(['q',['a'.repeat(301),'bad\u0000label']])).toEqual([]);
  });
  it('contacts only the selected provider, without credentials, with a cancellable timeout',async()=>{
    const fetchMock=vi.fn(async(_url:string,_init?:RequestInit)=>new Response(JSON.stringify(fixture('google')),{headers:{'content-type':'text/javascript; charset=UTF-8'}}));vi.stubGlobal('fetch',fetchMock);
    const controller=new AbortController();await providerSuggestions('google','test',controller.signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);expect(fetchMock.mock.calls[0]?.[0]).toContain('https://suggestqueries.google.com/');
    const init=(fetchMock.mock.calls as unknown as Array<[string,RequestInit]>)[0]![1];expect(init.credentials).toBe('omit');expect(init.signal).toBeInstanceOf(AbortSignal);controller.abort();expect(init.signal?.aborted).toBe(true);
  });
  it('does not fetch empty or excessive input and bounds/validates responses',async()=>{
    const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);const signal=new AbortController().signal;
    expect(await providerSuggestions('google',' ',signal)).toEqual([]);await expect(providerSuggestions('google','a'.repeat(257),signal)).rejects.toThrow();expect(fetchMock).not.toHaveBeenCalled();
    for(const response of [new Response('blocked',{status:403}),new Response('<html/>',{headers:{'content-type':'text/html'}}),new Response('not json',{headers:{'content-type':'application/json'}}),new Response('x'.repeat(262145),{headers:{'content-type':'application/json'}})]){fetchMock.mockResolvedValueOnce(response);await expect(providerSuggestions('google','q',signal)).rejects.toThrow();}
  });
  it('uses the published full Kinopoisk operation without user data, cookies or session headers',()=>{
    const request=suggestionRequest('kinopoisk','Матрица');expect(request.url).toBe('https://graphql.kinopoisk.ru/graphql/?operationName=SuggestSearch');
    expect(request.init?.headers).toEqual({'content-type':'application/json','service-id':'25'});expect(JSON.parse(request.init!.body as string).variables).toEqual({keyword:'Матрица',limit:6,withUserData:false});
    expect(JSON.parse(suggestionRequest('myshows','q').init!.body as string).method).toBe('shows.Search');
  });
});

it('bookmarks cannot produce a web request and disabling the mode has a safe fallback',async()=>{
 const network=vi.fn();vi.stubGlobal('fetch',network);
 expect(await providerSuggestions('bookmarks','private',new AbortController().signal)).toEqual([]);
 expect(network).not.toHaveBeenCalled();
 expect(()=>searchUrl('bookmarks','private')).toThrow();
 expect(()=>suggestionRequest('bookmarks','private')).toThrow();
 expect(validateSettings({searchProvider:'bookmarks',bookmarkSearch:false})).toMatchObject({searchProvider:'yandex',bookmarkSearch:false});
});

it('movie sources require explicit opt-in',async()=>{
 expect(validateSettings({}).movieSearch).toBe(false);
 for(const searchProvider of ['kinopoisk','imdb','myshows']) {
  expect(validateSettings({searchProvider})).toMatchObject({searchProvider:'yandex',movieSearch:false});
  expect(validateSettings({searchProvider,movieSearch:true})).toMatchObject({searchProvider,movieSearch:true});
  expect(validateSettings({searchProvider,movieSearch:false})).toMatchObject({searchProvider:'yandex',movieSearch:false});
  const settings={...defaults,movieSearch:true,searchProvider};
  expect(parseImport(await serializeExport({entries:[],settings:validateSettings(settings),background:null})).settings).toMatchObject({movieSearch:true,searchProvider});
 }
});
