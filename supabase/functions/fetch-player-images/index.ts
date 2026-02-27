import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Normalize player name for matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fuzzy match: check if search name parts are contained in result name
function fuzzyMatch(searchName: string, resultName: string): boolean {
  const searchParts = normalizeName(searchName).split(' ');
  const resultNorm = normalizeName(resultName);
  
  // Last name must match
  const lastName = searchParts[searchParts.length - 1];
  if (!resultNorm.includes(lastName)) return false;
  
  // At least first name initial or full first name should match
  if (searchParts.length > 1) {
    const firstName = searchParts[0];
    if (resultNorm.includes(firstName) || resultNorm.startsWith(firstName[0])) {
      return true;
    }
  }
  
  return searchParts.length === 1; // Single name match
}

// Fetch with timeout
async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
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

    if (!matchId) {
      return new Response(JSON.stringify({ success: false, error: 'matchId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get players without images for this match
    const { data: players, error: playersError } = await supabase
      .from('match_playing_xi')
      .select('id, player_name, team_id, player_image')
      .eq('match_id', matchId)
      .or('player_image.is.null,player_image.eq.');

    if (playersError) throw playersError;

    if (!players || players.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'All players already have images',
        updated: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[FetchImages] Found ${players.length} players without images`);

    let updatedCount = 0;
    const errors: string[] = [];

    // Process players in batches to avoid rate limiting
    for (const player of players) {
      try {
        let imageFound = false;
        const encodedName = encodeURIComponent(player.player_name);
        
        // === Source 1: TheSportsDB ===
        try {
          const searchUrl = `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodedName}`;
          const res = await fetchWithTimeout(searchUrl, 6000);
          
          if (res.ok) {
            const data = await res.json();
            if (data.player && data.player.length > 0) {
              let bestMatch = null;
              for (const p of data.player) {
                if (fuzzyMatch(player.player_name, p.strPlayer)) {
                  const imageUrl = p.strCutout || p.strThumb || p.strRender || null;
                  if (imageUrl) { bestMatch = imageUrl; break; }
                }
              }
              if (!bestMatch && data.player[0]) {
                const first = data.player[0];
                const imageUrl = first.strCutout || first.strThumb || first.strRender || null;
                if (imageUrl && normalizeName(first.strPlayer).includes(normalizeName(player.player_name).split(' ').pop()!)) {
                  bestMatch = imageUrl;
                }
              }
              if (bestMatch) {
                const { error: updateError } = await supabase
                  .from('match_playing_xi')
                  .update({ player_image: bestMatch })
                  .eq('id', player.id);
                if (!updateError) {
                  updatedCount++;
                  imageFound = true;
                  console.log(`[FetchImages] ✓ SportsDB: ${player.player_name}`);
                }
              }
            }
          }
        } catch (e) {
          console.warn(`[FetchImages] SportsDB failed for ${player.player_name}:`, e.message);
        }

        // === Source 2: Wikipedia REST API ===
        if (!imageFound) {
          try {
            // Try with full name first
            const wikiName = player.player_name.replace(/\s+/g, '_');
            const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiName)}`;
            const wikiRes = await fetchWithTimeout(wikiUrl, 6000);
            
            if (wikiRes.ok) {
              const wikiData = await wikiRes.json();
              // Check it's about a person (sportsperson) and has thumbnail
              const thumbnail = wikiData.thumbnail?.source || wikiData.originalimage?.source;
              if (thumbnail && wikiData.description && 
                  (wikiData.description.toLowerCase().includes('cricket') || 
                   wikiData.description.toLowerCase().includes('football') ||
                   wikiData.description.toLowerCase().includes('soccer') ||
                   wikiData.description.toLowerCase().includes('cricketer') ||
                   wikiData.description.toLowerCase().includes('footballer') ||
                   wikiData.description.toLowerCase().includes('player') ||
                   wikiData.description.toLowerCase().includes('athlete') ||
                   wikiData.description.toLowerCase().includes('sport'))) {
                // Use original image if available for better quality, else thumbnail
                const finalUrl = wikiData.originalimage?.source || thumbnail;
                const { error: updateError } = await supabase
                  .from('match_playing_xi')
                  .update({ player_image: finalUrl })
                  .eq('id', player.id);
                if (!updateError) {
                  updatedCount++;
                  imageFound = true;
                  console.log(`[FetchImages] ✓ Wikipedia: ${player.player_name}`);
                }
              } else {
                console.log(`[FetchImages] ✗ Wikipedia: ${player.player_name} - not a sportsperson or no image (desc: ${wikiData.description || 'none'})`);
              }
            } else if (wikiRes.status === 404) {
              // Try searching Wikipedia as fallback
              const searchApiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodedName}+cricketer+OR+footballer&format=json&srlimit=3`;
              const searchRes = await fetchWithTimeout(searchApiUrl, 6000);
              if (searchRes.ok) {
                const searchData = await searchRes.json();
                const results = searchData?.query?.search || [];
                for (const result of results) {
                  const title = result.title.replace(/\s+/g, '_');
                  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
                  const summaryRes = await fetchWithTimeout(summaryUrl, 5000);
                  if (summaryRes.ok) {
                    const summaryData = await summaryRes.json();
                    const thumb = summaryData.thumbnail?.source || summaryData.originalimage?.source;
                    if (thumb && summaryData.description &&
                        (summaryData.description.toLowerCase().includes('cricket') ||
                         summaryData.description.toLowerCase().includes('football') ||
                         summaryData.description.toLowerCase().includes('player') ||
                         summaryData.description.toLowerCase().includes('athlete'))) {
                      const finalUrl = summaryData.originalimage?.source || thumb;
                      const { error: updateError } = await supabase
                        .from('match_playing_xi')
                        .update({ player_image: finalUrl })
                        .eq('id', player.id);
                      if (!updateError) {
                        updatedCount++;
                        imageFound = true;
                        console.log(`[FetchImages] ✓ Wiki Search: ${player.player_name} → ${result.title}`);
                      }
                      break;
                    }
                  }
                  await new Promise(r => setTimeout(r, 200));
                }
              }
            }
          } catch (e) {
            console.warn(`[FetchImages] Wikipedia failed for ${player.player_name}:`, e.message);
          }
        }

        if (!imageFound) {
          console.log(`[FetchImages] ✗ ${player.player_name} - no image from any source`);
        }
        
        // Small delay between players
        await new Promise(r => setTimeout(r, 300));
        
      } catch (err) {
        console.warn(`[FetchImages] Error for ${player.player_name}:`, err.message);
        errors.push(`${player.player_name}: ${err.message}`);
      }
    }

    console.log(`[FetchImages] Done: ${updatedCount}/${players.length} images found`);

    return new Response(JSON.stringify({
      success: true,
      total: players.length,
      updated: updatedCount,
      notFound: players.length - updatedCount,
      errors: errors.length > 0 ? errors : undefined,
      message: `${updatedCount} out of ${players.length} missing images found`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[FetchImages] Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
