import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, X, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface HeaderItem {
  id: string;
  name: string;
  value: string;
  enabled: boolean;
}

interface HeaderEditorProps {
  headers: HeaderItem[];
  onChange: (headers: HeaderItem[]) => void;
  compact?: boolean;
}

const COMMON_HEADERS = [
  { name: "Referer", description: "The URL of the page making the request" },
  { name: "Origin", description: "The origin (scheme + host + port) of the request" },
  { name: "User-Agent", description: "Browser/client identification string" },
  { name: "Cookie", description: "Session cookies for authentication" },
];

const HeaderEditor = ({ headers, onChange, compact = false }: HeaderEditorProps) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHeaderName, setNewHeaderName] = useState("");
  const [newHeaderValue, setNewHeaderValue] = useState("");

  const generateId = () => `header_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const toggleHeader = (id: string) => {
    onChange(
      headers.map((h) =>
        h.id === id ? { ...h, enabled: !h.enabled } : h
      )
    );
  };

  const updateHeaderValue = (id: string, value: string) => {
    onChange(
      headers.map((h) =>
        h.id === id ? { ...h, value } : h
      )
    );
  };

  const removeHeader = (id: string) => {
    onChange(headers.filter((h) => h.id !== id));
  };

  const addHeader = () => {
    if (!newHeaderName.trim()) return;
    
    onChange([
      ...headers,
      {
        id: generateId(),
        name: newHeaderName.trim(),
        value: newHeaderValue.trim(),
        enabled: true,
      },
    ]);
    setNewHeaderName("");
    setNewHeaderValue("");
    setShowAddForm(false);
  };

  const addQuickHeader = (name: string) => {
    // Check if header already exists
    if (headers.some((h) => h.name.toLowerCase() === name.toLowerCase())) {
      return;
    }
    onChange([
      ...headers,
      {
        id: generateId(),
        name,
        value: "",
        enabled: true,
      },
    ]);
  };

  const getHeaderDescription = (name: string) => {
    const found = COMMON_HEADERS.find(
      (h) => h.name.toLowerCase() === name.toLowerCase()
    );
    return found?.description;
  };

  return (
    <div className="space-y-3">
      {/* Header List */}
      <div className="space-y-2">
        {headers.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2 text-center border border-dashed rounded-md">
            No headers configured
          </div>
        ) : (
          headers.map((header) => (
            <div
              key={header.id}
              className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${
                header.enabled
                  ? "bg-primary/5 border-primary/20"
                  : "bg-muted/30 border-border opacity-60"
              }`}
            >
              <Checkbox
                checked={header.enabled}
                onCheckedChange={() => toggleHeader(header.id)}
                className="flex-shrink-0"
              />
              
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <div className="flex items-center gap-1 min-w-[80px]">
                  <span className="text-sm font-medium truncate">{header.name}</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3 h-3 text-muted-foreground cursor-help flex-shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs max-w-[200px]">
                          {getHeaderDescription(header.name) || `Custom ${header.name} header`}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                
                <Input
                  value={header.value}
                  onChange={(e) => updateHeaderValue(header.id, e.target.value)}
                  placeholder={`Enter ${header.name} value`}
                  className={`flex-1 h-8 text-sm ${compact ? "text-xs" : ""}`}
                  disabled={!header.enabled}
                />
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                onClick={() => removeHeader(header.id)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Quick Add Buttons */}
      <div className="flex flex-wrap gap-1.5">
        {COMMON_HEADERS.filter(
          (h) => !headers.some((header) => header.name.toLowerCase() === h.name.toLowerCase())
        ).map((header) => (
          <Button
            key={header.name}
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => addQuickHeader(header.name)}
          >
            <Plus className="w-3 h-3 mr-1" />
            {header.name}
          </Button>
        ))}
      </div>

      {/* Add Custom Header */}
      {showAddForm ? (
        <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/20">
          <Input
            value={newHeaderName}
            onChange={(e) => setNewHeaderName(e.target.value)}
            placeholder="Header name"
            className="h-8 text-sm w-[120px]"
            autoFocus
          />
          <Input
            value={newHeaderValue}
            onChange={(e) => setNewHeaderValue(e.target.value)}
            placeholder="Value"
            className="h-8 text-sm flex-1"
            onKeyDown={(e) => e.key === "Enter" && addHeader()}
          />
          <Button size="sm" className="h-8" onClick={addHeader}>
            Add
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              setShowAddForm(false);
              setNewHeaderName("");
              setNewHeaderValue("");
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="text-primary hover:text-primary"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add custom header
        </Button>
      )}

      {/* Info Text */}
      <p className="text-xs text-muted-foreground">
        Headers are sent via proxy to enable streams requiring custom referer.
      </p>
    </div>
  );
};

// Helper function to convert header items to the server form format
export const headersToServerForm = (headers: HeaderItem[]) => {
  const result: Record<string, string> = {
    referer_value: "",
    origin_value: "",
    cookie_value: "",
    user_agent: "",
  };

  headers.forEach((header) => {
    if (!header.enabled) return;
    
    const nameLower = header.name.toLowerCase();
    if (nameLower === "referer") {
      result.referer_value = header.value;
    } else if (nameLower === "origin") {
      result.origin_value = header.value;
    } else if (nameLower === "cookie") {
      result.cookie_value = header.value;
    } else if (nameLower === "user-agent") {
      result.user_agent = header.value;
    }
  });

  return result;
};

// Helper function to convert server form values to header items
export const serverFormToHeaders = (form: {
  referer_value?: string;
  origin_value?: string;
  cookie_value?: string;
  user_agent?: string;
}): HeaderItem[] => {
  const headers: HeaderItem[] = [];
  const generateId = () => `header_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (form.referer_value) {
    headers.push({
      id: generateId(),
      name: "Referer",
      value: form.referer_value,
      enabled: true,
    });
  }
  if (form.origin_value) {
    headers.push({
      id: generateId(),
      name: "Origin",
      value: form.origin_value,
      enabled: true,
    });
  }
  if (form.cookie_value) {
    headers.push({
      id: generateId(),
      name: "Cookie",
      value: form.cookie_value,
      enabled: true,
    });
  }
  if (form.user_agent) {
    headers.push({
      id: generateId(),
      name: "User-Agent",
      value: form.user_agent,
      enabled: true,
    });
  }

  return headers;
};

export default HeaderEditor;
