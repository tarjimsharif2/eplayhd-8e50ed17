import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import DOMPurify from 'dompurify';

interface SponsorNoticeData {
  id: string;
  title: string;
  content: string;
  position: string;
  display_type: 'static' | 'marquee';
  text_color: string;
  background_color: string;
  is_active: boolean;
  display_order: number;
  match_id: string | null;
  is_global: boolean;
}

interface SponsorNoticeProps {
  position: 'before_stream' | 'before_servers' | 'before_scoreboard';
  matchId?: string;
}

const SponsorNotice = ({ position, matchId }: SponsorNoticeProps) => {
  const [notices, setNotices] = useState<SponsorNoticeData[]>([]);

  useEffect(() => {
    const fetchNotices = async () => {
      let query = supabase
        .from('sponsor_notices')
        .select('*')
        .eq('position', position)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      // Get notices that are either global or for this specific match
      if (matchId) {
        query = query.or(`is_global.eq.true,match_id.eq.${matchId}`);
      } else {
        query = query.eq('is_global', true);
      }

      const { data, error } = await query;
      if (!error && data) {
        setNotices(data as SponsorNoticeData[]);
      }
    };

    fetchNotices();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('sponsor_notices_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sponsor_notices',
        },
        () => {
          fetchNotices();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [position, matchId]);

  if (notices.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {notices.map((notice, index) => (
        <motion.div
          key={notice.id}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="rounded-lg overflow-hidden"
          style={{ backgroundColor: notice.background_color }}
        >
          {notice.display_type === 'marquee' ? (
            <div className="overflow-hidden py-2 px-4">
              <div
                className="whitespace-nowrap animate-marquee"
                style={{ color: notice.text_color }}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(notice.content) }}
              />
            </div>
          ) : (
            <div
              className="py-2 px-4 text-center"
              style={{ color: notice.text_color }}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(notice.content) }}
            />
          )}
        </motion.div>
      ))}
    </div>
  );
};

export default SponsorNotice;
