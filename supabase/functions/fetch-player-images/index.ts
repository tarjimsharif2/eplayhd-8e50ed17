import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/['']/g, '').replace(/\s+/g, ' ').trim();
}

function fuzzyMatch(searchName: string, resultName: string): boolean {
  const searchParts = normalizeName(searchName).split(' ');
  const resultNorm = normalizeName(resultName);
  const lastName = searchParts[searchParts.length - 1];
  if (!resultNorm.includes(lastName)) return false;
  if (searchParts.length > 1) {
    const firstName = searchParts[0];
    if (resultNorm.includes(firstName) || resultNorm.startsWith(firstName[0])) return true;
  }
  return searchParts.length === 1;
}

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

function isSportsPerson(desc: string | undefined): boolean {
  if (!desc) return false;
  return /cricket|football|soccer|cricketer|footballer|player|athlete|sport|batsman|bowler|keeper/i.test(desc);
}

// Source 1: Wikipedia direct + search (combined)
async function tryWikipedia(playerName: string, sport: string): Promise<string | null> {
  try {
    const wikiName = playerName.replace(/\s+/g, '_');
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiName)}`;
    const res = await fetchWithTimeout(url, 6000);
    
    if (res.ok) {
      const data = await res.json();
      const thumb = data.originalimage?.source || data.thumbnail?.source;
      if (thumb && (isSportsPerson(data.description) || (data.type === 'standard' && !data.description?.includes('Topics referred')))) {
        console.log(`[FetchImages] ✓ Wikipedia: ${playerName}`);
        return thumb;
      }
      if (!thumb) {
        console.log(`[FetchImages] ~ Wiki: ${playerName} - no image on page (desc: ${data.description || 'none'})`);
      }
    }
    
    // Wikipedia search fallback
    const sportTerm = sport === 'football' ? 'footballer' : 'cricketer';
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(playerName + ' ' + sportTerm)}&format=json&srlimit=3`;
    const searchRes = await fetchWithTimeout(searchUrl, 6000);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      for (const result of (searchData?.query?.search || [])) {
        const lastName = normalizeName(playerName).split(' ').pop()!;
        if (!normalizeName(result.title).includes(lastName)) continue;
        
        const sUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(result.title.replace(/\s+/g, '_'))}`;
        const sRes = await fetchWithTimeout(sUrl, 5000);
        if (sRes.ok) {
          const sd = await sRes.json();
          const t = sd.originalimage?.source || sd.thumbnail?.source;
          if (t && isSportsPerson(sd.description)) {
            console.log(`[FetchImages] ✓ Wiki Search: ${playerName} → ${result.title}`);
            return t;
          }
        }
        await new Promise(r => setTimeout(r, 150));
      }
    }
  } catch (e) {
    console.log(`[FetchImages] Wiki error for ${playerName}: ${e.message}`);
  }
  return null;
}

// Source 2: Wikidata to find Wikipedia with image
async function tryWikidata(playerName: string, sport: string): Promise<string | null> {
  try {
    const sportTerm = sport === 'football' ? 'footballer' : 'cricketer';
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(playerName + ' ' + sportTerm)}&language=en&format=json&limit=3`;
    const res = await fetchWithTimeout(url, 6000);
    if (!res.ok) return null;
    
    const data = await res.json();
    for (const entity of (data?.search || [])) {
      if (!isSportsPerson(entity.description)) continue;
      
      // Get Wikidata entity to find image (P18 property)
      const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entity.id}&props=claims|sitelinks&sitefilter=enwiki&format=json`;
      const entityRes = await fetchWithTimeout(entityUrl, 5000);
      if (!entityRes.ok) continue;
      
      const entityData = await entityRes.json();
      const entityInfo = entityData?.entities?.[entity.id];
      
      // Check P18 (image) claim on Wikidata
      const imageClaim = entityInfo?.claims?.P18;
      if (imageClaim && imageClaim.length > 0) {
        const fileName = imageClaim[0]?.mainsnak?.datavalue?.value;
        if (fileName) {
          // Construct Wikimedia Commons URL
          const encodedFile = encodeURIComponent(fileName.replace(/ /g, '_'));
          // Use MD5 hash path for commons
          const md5 = await crypto.subtle.digest('MD5', new TextEncoder().encode(fileName.replace(/ /g, '_')));
          const hashArray = Array.from(new Uint8Array(md5));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          const a = hashHex[0];
          const ab = hashHex.substring(0, 2);
          const imageUrl = `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${ab}/${encodedFile}/400px-${encodedFile}`;
          console.log(`[FetchImages] ✓ Wikidata P18: ${playerName} → ${fileName}`);
          return imageUrl;
        }
      }
      
      // Fallback: try Wikipedia page from sitelinks
      const enwikiTitle = entityInfo?.sitelinks?.enwiki?.title;
      if (enwikiTitle) {
        const sUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(enwikiTitle.replace(/\s+/g, '_'))}`;
        const sRes = await fetchWithTimeout(sUrl, 5000);
        if (sRes.ok) {
          const sd = await sRes.json();
          const t = sd.originalimage?.source || sd.thumbnail?.source;
          if (t) {
            console.log(`[FetchImages] ✓ Wikidata→Wiki: ${playerName} → ${enwikiTitle}`);
            return t;
          }
        }
      }
      await new Promise(r => setTimeout(r, 200));
    }
  } catch (e) {
    console.log(`[FetchImages] Wikidata error for ${playerName}: ${e.message}`);
  }
  return null;
}

// Source 3: TheSportsDB
async function tryTheSportsDB(playerName: string): Promise<string | null> {
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(playerName)}`;
    const res = await fetchWithTimeout(url, 6000);
    if (!res.ok) return null;
    
    const data = await res.json();
    if (!data.player?.length) return null;
    
    for (const p of data.player) {
      if (fuzzyMatch(playerName, p.strPlayer)) {
        const img = p.strCutout || p.strThumb || p.strRender;
        if (img) { console.log(`[FetchImages] ✓ SportsDB: ${playerName}`); return img; }
      }
    }
    const first = data.player[0];
    const img = first.strCutout || first.strThumb || first.strRender;
    if (img && normalizeName(first.strPlayer).includes(normalizeName(playerName).split(' ').pop()!)) {
      console.log(`[FetchImages] ✓ SportsDB: ${playerName} → ${first.strPlayer}`);
      return img;
    }
  } catch (e) {
    console.log(`[FetchImages] SportsDB error: ${e.message}`);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { matchId, sport } = await req.json();
    const sportType = sport || 'cricket';

    if (!matchId) {
      return new Response(JSON.stringify({ success: false, error: 'matchId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: players, error: playersError } = await supabase
      .from('match_playing_xi')
      .select('id, player_name, team_id, player_image')
      .eq('match_id', matchId)
      .or('player_image.is.null,player_image.eq.');

    if (playersError) throw playersError;

    if (!players || players.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, message: 'All players already have images', updated: 0 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[FetchImages] Processing ${players.length} players (sport: ${sportType})`);

    let updatedCount = 0;
    const errors: string[] = [];
    const sourceStats: Record<string, number> = {};

    for (const player of players) {
      try {
        let imageUrl: string | null = null;

        // 1. Wikipedia (most common source with images)
        imageUrl = await tryWikipedia(player.player_name, sportType);
        
        // 2. Wikidata (finds images via P18 property even when Wikipedia page has no infobox image)
        if (!imageUrl) imageUrl = await tryWikidata(player.player_name, sportType);
        
        // 3. TheSportsDB fallback
        if (!imageUrl) imageUrl = await tryTheSportsDB(player.player_name);

        if (imageUrl) {
          const { error: updateError } = await supabase
            .from('match_playing_xi')
            .update({ player_image: imageUrl })
            .eq('id', player.id);
          if (!updateError) updatedCount++;
        } else {
          console.log(`[FetchImages] ✗ ${player.player_name} - no image from any source`);
        }

        await new Promise(r => setTimeout(r, 250));
      } catch (err) {
        console.warn(`[FetchImages] Error: ${player.player_name}: ${err.message}`);
        errors.push(`${player.player_name}: ${err.message}`);
      }
    }

    console.log(`[FetchImages] Complete: ${updatedCount}/${players.length} images found`);

    return new Response(JSON.stringify({
      success: true, total: players.length, updated: updatedCount,
      notFound: players.length - updatedCount,
      errors: errors.length > 0 ? errors : undefined,
      message: `${updatedCount} out of ${players.length} missing images found`
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[FetchImages] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
