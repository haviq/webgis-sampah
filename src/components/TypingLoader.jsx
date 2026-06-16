import React from "react";

export default function TypingLoader() {
  const text = "WEBGIS SAMPAH.";
  
  return (
    <div className="typing-loader-container">
      <div className="stagger-text">
        {text.split("").map((char, index) => (
          <span 
            key={index} 
            className="stagger-char" 
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            {char === " " ? "\u00A0" : char}
          </span>
        ))}
      </div>
    </div>
  );
}
