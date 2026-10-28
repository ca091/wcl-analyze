export const ZONES_QUERY = `query Zones {
  worldData { zones {
    id name expansion { id name }
    difficulties { id name }
    partitions { id name default }
    encounters { id name }
  } }
}`;

export const CLASSES_QUERY = `query Classes { gameData { classes { id name } } }`;

export const REALMS_QUERY = `query Realms($region: String!, $page: Int!) {
  worldData { region(slug: $region) {
    servers(limit: 100, page: $page) {
      data { id name normalizedName slug }
      has_more_pages
    }
  } }
}`;

export const CHARACTER_QUERY = `query Character($name: String!, $realm: String!, $region: String!) {
  characterData { character(name: $name, serverSlug: $realm, serverRegion: $region) {
    id canonicalID name classID hidden
  } }
}`;

export const RANKINGS_QUERY = `query Rankings(
  $id: Int!, $zone: Int!, $difficulty: Int!, $metric: CharacterPageRankingMetricType!,
  $partition: Int, $spec: String, $timeframe: RankingTimeframeType!
) {
  characterData { character(id: $id) {
    id hidden
    zoneRankings(zoneID: $zone, difficulty: $difficulty, metric: $metric,
      partition: $partition, specName: $spec, timeframe: $timeframe, includePrivateLogs: false)
  } }
  rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }
}`;
