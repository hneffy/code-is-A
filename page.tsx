"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import AlinaWakeEffect from "@/components/AlinaWakeEffect"
import ChatBubble from "@/components/ChatBubble"
import { speakText } from "@/services/elevenLabsTTS"
import { getChatResponse } from "@/services/chatA40MiniAPI"
import { searchGoogle } from "@/services/googleSearch"
import DiagnosticPanel from "@/components/DiagnosticPanel"

// Add this after the imports and before the component
const DEBUG_MODE = true // Set to false in production

// Add this logging function
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[ALINA DEBUG] ${message}`, data || "")
  }
}

interface Message {
  id: string
  text: string
  isUser: boolean
  timestamp: Date
}

export default function AlinaApp() {
  const [wakeWordHeard, setWakeWordHeard] = useState(false)
  const [spokenInput, setSpokenInput] = useState("")
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPassiveListening, setIsPassiveListening] = useState(true)

  const recognitionRef = useRef<any>(null)
  const passiveRecognitionRef = useRef<any>(null)

  // Initialize passive wake word listening
  useEffect(() => {
    debugLog("Initializing speech recognition...")

    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      debugLog("ERROR: Speech recognition not supported in this browser")
      return
    }

    debugLog("Speech recognition supported, starting passive listening...")

    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition

      // Passive listening for wake word
      const passiveRecognition = new SpeechRecognition()
      passiveRecognition.continuous = true
      passiveRecognition.interimResults = true
      passiveRecognition.lang = "en-US"

      passiveRecognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join("")
          .toLowerCase()

        debugLog("Passive recognition heard:", transcript)

        if (transcript.includes("alina") || transcript.includes("aleena")) {
          debugLog("Wake word detected!")
          setWakeWordHeard(true)
          setIsPassiveListening(false)
          passiveRecognition.stop()
          startActiveListening()
        }
      }

      passiveRecognition.onerror = (event: any) => {
        debugLog("Passive recognition error:", event.error)
        console.log("Passive recognition error:", event.error)
        // Restart passive listening after error
        setTimeout(() => {
          if (isPassiveListening) {
            passiveRecognition.start()
          }
        }, 1000)
      }

      passiveRecognitionRef.current = passiveRecognition

      if (isPassiveListening) {
        passiveRecognition.start()
      }
    }

    return () => {
      if (passiveRecognitionRef.current) {
        passiveRecognitionRef.current.stop()
      }
    }
  }, [isPassiveListening])

  const startActiveListening = () => {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
      const recognition = new SpeechRecognition()

      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = "en-US"

      recognition.onstart = () => {
        setIsListening(true)
      }

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript
        setSpokenInput(transcript)
        handleUserInput(transcript)
      }

      recognition.onerror = (event: any) => {
        console.log("Recognition error:", event.error)
        setIsListening(false)
        resetToPassiveListening()
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current = recognition
      recognition.start()
    }
  }

  const handleUserInput = async (input: string) => {
    debugLog("Processing user input:", input)
    setIsProcessing(true)

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      text: input,
      isUser: true,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])

    try {
      let response = ""

      // Determine if it's a question or factual query
      const isQuestion =
        input.toLowerCase().includes("what") ||
        input.toLowerCase().includes("how") ||
        input.toLowerCase().includes("why") ||
        input.toLowerCase().includes("when") ||
        input.toLowerCase().includes("where") ||
        input.toLowerCase().includes("?")

      debugLog("Is question:", isQuestion)

      if (isQuestion && !input.toLowerCase().includes("search")) {
        debugLog("Using Chat A40 Mini API...")
        response = await getChatResponse(input)
      } else {
        debugLog("Using Search API...")
        response = await searchGoogle(input)
      }

      debugLog("API response received:", response)

      // Add AI response
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response,
        isUser: false,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, aiMessage])

      // Speak the response
      await speakResponse(response)
    } catch (error) {
      debugLog("ERROR in handleUserInput:", error)
      console.error("Error processing input:", error)
      const errorMessage = "I'm sorry, I encountered an error processing your request."

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: errorMessage,
        isUser: false,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, aiMessage])

      await speakResponse(errorMessage)
    }

    setIsProcessing(false)

    // Reset to passive listening after a delay
    setTimeout(() => {
      resetToPassiveListening()
    }, 2000)
  }

  const speakResponse = async (text: string) => {
    setIsSpeaking(true)
    try {
      await speakText(text)
    } catch (error) {
      console.error("Error speaking response:", error)
    }
    setIsSpeaking(false)
  }

  const resetToPassiveListening = () => {
    setWakeWordHeard(false)
    setIsPassiveListening(true)
    setSpokenInput("")

    // Restart passive listening
    if (passiveRecognitionRef.current) {
      try {
        passiveRecognitionRef.current.start()
      } catch (error) {
        console.log("Error restarting passive listening:", error)
      }
    }
  }

  const manualActivate = () => {
    if (isPassiveListening) {
      setWakeWordHeard(true)
      setIsPassiveListening(false)
      if (passiveRecognitionRef.current) {
        passiveRecognitionRef.current.stop()
      }
      startActiveListening()
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-black text-white overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent"></div>

      {/* Header */}
      <header className="relative z-10 p-6 text-center">
        <motion.h1
          className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          ALINA
        </motion.h1>
        <motion.p
          className="text-gray-400 mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          Advanced Linguistic Intelligence Neural Assistant
        </motion.p>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-[60vh] px-6">
        {/* Wake Effect */}
        <AlinaWakeEffect
          isActive={wakeWordHeard || isListening || isSpeaking}
          isListening={isListening}
          isSpeaking={isSpeaking}
        />

        {/* Status Display */}
        <motion.div
          className="mt-8 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <AnimatePresence mode="wait">
            {isPassiveListening && (
              <motion.div
                key="passive"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-gray-400"
              >
                <p>Say "Alina" to activate</p>
                <button
                  onClick={manualActivate}
                  className="mt-2 px-4 py-2 bg-blue-600/20 border border-blue-400/30 rounded-lg hover:bg-blue-600/30 transition-colors"
                >
                  Manual Activate
                </button>
              </motion.div>
            )}

            {isListening && (
              <motion.div
                key="listening"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-cyan-400"
              >
                <p>Listening...</p>
              </motion.div>
            )}

            {isProcessing && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-yellow-400"
              >
                <p>Processing...</p>
              </motion.div>
            )}

            {isSpeaking && (
              <motion.div
                key="speaking"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-green-400"
              >
                <p>Speaking...</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Current Input Display */}
        {spokenInput && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-4 p-4 bg-blue-900/20 border border-blue-400/30 rounded-lg max-w-md"
          >
            <p className="text-cyan-300">You said: "{spokenInput}"</p>
          </motion.div>
        )}
      </main>

      {/* Chat Messages */}
      {messages.length > 0 && (
        <div className="relative z-10 max-w-4xl mx-auto px-6 pb-6">
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 text-center p-6 text-gray-500 text-sm">
        <p>Powered by Chat A40 Mini • ElevenLabs • SearchAPI</p>
      </footer>
      {process.env.NODE_ENV === "development" && <DiagnosticPanel />}
    </div>
  )
}
