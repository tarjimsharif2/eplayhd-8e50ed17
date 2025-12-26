import { useParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { useDynamicPage } from "@/hooks/useDynamicPages";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import DOMPurify from "dompurify";
import { useMemo } from "react";
import NotFound from "./NotFound";

const DynamicPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const { data: page, isLoading, error } = useDynamicPage(slug || '');

  // Sanitize HTML content
  const sanitizedContent = useMemo(() => {
    if (!page?.content) return '';
    
    if (page.content_type === 'html') {
      return DOMPurify.sanitize(page.content, {
        ADD_TAGS: ['iframe'],
        ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'style', 'class', 'id'],
      });
    }
    
    return page.content;
  }, [page]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !page) {
    return <NotFound />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead 
        title={page.seo_title || page.title}
        description={page.seo_description || undefined}
        keywords={page.seo_keywords || undefined}
        ogImage={page.og_image_url || undefined}
      />
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto"
          >
            <div className="bg-card border border-border rounded-2xl p-8 shadow-lg">
              {page.content_type === 'html' ? (
                <div 
                  className="prose prose-invert max-w-none dynamic-page-content"
                  dangerouslySetInnerHTML={{ __html: sanitizedContent }}
                />
              ) : (
                <div className="whitespace-pre-wrap text-foreground">
                  {sanitizedContent}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DynamicPage;
