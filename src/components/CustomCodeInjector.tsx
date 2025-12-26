import { useEffect } from "react";
import { usePublicSiteSettings } from "@/hooks/usePublicSiteSettings";

const CustomCodeInjector = () => {
  const { data: settings } = usePublicSiteSettings();

  useEffect(() => {
    if (!settings) return;

    // Inject header code into <head>
    if (settings.custom_header_code) {
      const headerId = "custom-header-code";
      // Remove existing header code if present
      const existingHeader = document.getElementById(headerId);
      if (existingHeader) {
        existingHeader.remove();
      }

      // Create container and inject code
      const headerContainer = document.createElement("div");
      headerContainer.id = headerId;
      headerContainer.innerHTML = settings.custom_header_code;

      // Execute any scripts in the header code
      const scripts = headerContainer.querySelectorAll("script");
      scripts.forEach((oldScript) => {
        const newScript = document.createElement("script");
        // Copy attributes
        Array.from(oldScript.attributes).forEach((attr) => {
          newScript.setAttribute(attr.name, attr.value);
        });
        // Copy content
        newScript.textContent = oldScript.textContent;
        oldScript.parentNode?.replaceChild(newScript, oldScript);
      });

      // Append non-script elements to head
      const nonScriptElements = Array.from(headerContainer.children).filter(
        (el) => el.tagName !== "SCRIPT"
      );
      nonScriptElements.forEach((el) => {
        document.head.appendChild(el.cloneNode(true));
      });

      // Append scripts to head (already executed above, but for structure)
      const scriptElements = headerContainer.querySelectorAll("script");
      scriptElements.forEach((script) => {
        document.head.appendChild(script.cloneNode(true));
      });
    }

    // Inject footer code before </body>
    if (settings.custom_footer_code) {
      const footerId = "custom-footer-code";
      // Remove existing footer code if present
      const existingFooter = document.getElementById(footerId);
      if (existingFooter) {
        existingFooter.remove();
      }

      // Create container for footer code
      const footerContainer = document.createElement("div");
      footerContainer.id = footerId;
      footerContainer.innerHTML = settings.custom_footer_code;

      // Execute any scripts in the footer code
      const scripts = footerContainer.querySelectorAll("script");
      scripts.forEach((oldScript) => {
        const newScript = document.createElement("script");
        // Copy attributes
        Array.from(oldScript.attributes).forEach((attr) => {
          newScript.setAttribute(attr.name, attr.value);
        });
        // Copy content
        newScript.textContent = oldScript.textContent;
        oldScript.parentNode?.replaceChild(newScript, oldScript);
      });

      // Append to body
      document.body.appendChild(footerContainer);
    }

    // Cleanup function
    return () => {
      const headerCode = document.getElementById("custom-header-code");
      const footerCode = document.getElementById("custom-footer-code");
      if (headerCode) headerCode.remove();
      if (footerCode) footerCode.remove();
    };
  }, [settings?.custom_header_code, settings?.custom_footer_code]);

  // This component doesn't render anything visible
  return null;
};

export default CustomCodeInjector;
