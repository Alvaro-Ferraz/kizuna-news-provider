'use strict';

const V1_PROVIDER_DEFINITIONS = Object.freeze({
  ann: Object.freeze({
    providerKey: 'ann',
    sourceDisplayName: 'Anime News Network',
    discoveryMethod: 'DIRECT_RSS',
    feedHosts: Object.freeze(['www.animenewsnetwork.com']),
    articleHosts: Object.freeze(['animenewsnetwork.com', 'www.animenewsnetwork.com']),
    feeds: Object.freeze([Object.freeze({
      url: 'https://www.animenewsnetwork.com/news/rss.xml?ann-edition=us',
      language: 'en',
      locale: 'en-US',
    })]),
    imageFromFeed: false,
    imageFromEncodedContent: false,
  }),
  animecorner: Object.freeze({
    providerKey: 'animecorner',
    sourceDisplayName: 'Anime Corner',
    discoveryMethod: 'DIRECT_RSS',
    feedHosts: Object.freeze(['animecorner.me', 'www.animecorner.me']),
    articleHosts: Object.freeze(['animecorner.me', 'www.animecorner.me']),
    feeds: Object.freeze([Object.freeze({
      url: 'https://animecorner.me/feed/',
      language: 'en',
      locale: 'en-US',
    })]),
    imageFromFeed: true,
    imageFromEncodedContent: true,
  }),
  animetrending: Object.freeze({
    providerKey: 'animetrending',
    sourceDisplayName: 'Anime Trending',
    discoveryMethod: 'DIRECT_RSS',
    feedHosts: Object.freeze(['anitrendz.net', 'www.anitrendz.net']),
    articleHosts: Object.freeze(['anitrendz.net', 'www.anitrendz.net']),
    feeds: Object.freeze([Object.freeze({
      url: 'https://anitrendz.net/news/feed/',
      language: 'en',
      locale: 'en-US',
    })]),
    imageFromFeed: true,
    imageFromEncodedContent: true,
  }),
  crunchyroll: Object.freeze({
    providerKey: 'crunchyroll',
    sourceDisplayName: 'Crunchyroll',
    discoveryMethod: 'DIRECT_RSS',
    feedHosts: Object.freeze(['cr-news-api-service.prd.crunchyrollsvc.com']),
    articleHosts: Object.freeze(['crunchyroll.com', 'www.crunchyroll.com']),
    feeds: Object.freeze([
      Object.freeze({
        url: 'https://cr-news-api-service.prd.crunchyrollsvc.com/v1/pt-BR/rss',
        language: 'pt',
        locale: 'pt-BR',
      }),
      Object.freeze({
        url: 'https://cr-news-api-service.prd.crunchyrollsvc.com/v1/en-US/rss',
        language: 'en',
        locale: 'en-US',
      }),
    ]),
    imageFromFeed: true,
    imageFromEncodedContent: false,
  }),
  myanimelist: Object.freeze({
    providerKey: 'myanimelist',
    sourceDisplayName: 'MyAnimeList',
    discoveryMethod: 'DIRECT_RSS',
    feedHosts: Object.freeze(['myanimelist.net', 'www.myanimelist.net']),
    articleHosts: Object.freeze(['myanimelist.net', 'www.myanimelist.net']),
    feeds: Object.freeze([Object.freeze({
      url: 'https://myanimelist.net/rss/news.xml',
      language: 'en',
      locale: 'en-US',
    })]),
    imageFromFeed: true,
    imageFromEncodedContent: true,
  }),
  otakuusa: Object.freeze({
    providerKey: 'otakuusa',
    sourceDisplayName: 'Otaku USA',
    discoveryMethod: 'DIRECT_RSS',
    feedHosts: Object.freeze(['otakuusamagazine.com', 'www.otakuusamagazine.com']),
    articleHosts: Object.freeze(['otakuusamagazine.com', 'www.otakuusamagazine.com']),
    feeds: Object.freeze([Object.freeze({
      url: 'https://otakuusamagazine.com/feed/',
      language: 'en',
      locale: 'en-US',
    })]),
    imageFromFeed: true,
    imageFromEncodedContent: true,
  }),
  animeherald: Object.freeze({
    providerKey: 'animeherald',
    sourceDisplayName: 'Anime Herald',
    discoveryMethod: 'DIRECT_RSS',
    feedHosts: Object.freeze(['animeherald.com', 'www.animeherald.com']),
    articleHosts: Object.freeze(['animeherald.com', 'www.animeherald.com']),
    feeds: Object.freeze([Object.freeze({
      url: 'https://animeherald.com/feed/',
      language: 'en',
      locale: 'en-US',
    })]),
    imageFromFeed: true,
    imageFromEncodedContent: true,
  }),
});

module.exports = { V1_PROVIDER_DEFINITIONS };
