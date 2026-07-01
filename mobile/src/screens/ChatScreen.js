// Resolution Fitness App — AI Coach Chat Screen
// Conversational AI fitness coach.
// Theme-aware: bubbles, input bar, error treatment all flip with scheme.
//
// Header has Mimi's brand mark on the right and a back button on the
// left (since the screen is pushed from a tab into a stack — no
// nav-stack back affordance by default). The header lives OUTSIDE the
// KeyboardAvoidingView so it stays pinned when the soft keyboard rises.

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../api/client';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Shadows } from '../theme/spacing';
import MimiMark from '../components/MimiMark';

export default function ChatScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollToEnd?.({ animated: true });
  }, [messages]);

  const fetchHistory = async () => {
    try {
      const data = await api.getChatHistory();
      const history = data.data || data.messages || data || [];
      setMessages(Array.isArray(history) ? history : []);
    } catch (err) {
      console.warn('Chat history fetch failed:', err.message);
      setMessages([
        { role: 'assistant', content: "Hey there! 💪 I'm your AI fitness coach. Ask me anything — workout tips, nutrition advice, form checks, or motivation. What can I help with today?" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    const userMsg = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setSending(true);

    try {
      const data = await api.sendChatMessage(text);
      const reply = data.data || data;
      const assistantMsg = {
        role: 'assistant',
        content: reply.response || reply.content || reply.message || 'I got it! Keep pushing forward! 💪',
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Sorry, I had trouble connecting. Please try again.',
        error: true,
      }]);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.outer}>
      {/* ── Header ─────────────────────────────────────────────
          Slim top bar with Mimi's brand mark (28pt) on the right
          and a back button on the left. Sits OUTSIDE the
          KeyboardAvoidingView so it stays pinned when the soft
          keyboard rises on iOS. */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity
          style={styles.headerBack}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.headerBackText, { color: colors.textPrimary }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text
            style={[
              styles.headerTitle,
              { color: colors.textPrimary },
            ]}
          >
            Mimi
          </Text>
        </View>
        <MimiMark size={28} />
      </View>

      <KeyboardAvoidingView
        style={styles.scrollInput}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            return (
              <View
                key={idx}
                style={[
                  styles.messageBubble,
                  isUser
                    ? { backgroundColor: colors.accent, alignSelf: 'flex-end', borderBottomRightRadius: BorderRadius.sm }
                    : { backgroundColor: colors.surface, alignSelf: 'flex-start', borderBottomLeftRadius: BorderRadius.sm, ...Shadows.sm },
                  msg.error && { backgroundColor: colors.accentWash },
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    isUser
                      ? { color: colors.textInverse }
                      : { color: colors.textPrimary },
                    msg.error && { color: colors.error },
                  ]}
                >
                  {msg.content}
                </Text>
              </View>
            );
          })}

          {sending && (
            <View
              style={[styles.messageBubble, { backgroundColor: colors.surface, alignSelf: 'flex-start', ...Shadows.sm }]}
            >
              <ActivityIndicator size="small" color={colors.accent} />
            </View>
          )}
        </ScrollView>

        {/* ── Input Bar ────────────────────────────────────────── */}
        <View
          style={[
            styles.inputBar,
            { backgroundColor: colors.surface, borderTopColor: colors.border },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.surfaceMuted, color: colors.textPrimary },
            ]}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask your AI coach..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              !inputText.trim() && { backgroundColor: colors.divider },
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            <Text style={[styles.sendBtnText, { color: colors.textInverse }]}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function makeStyles(theme) {
  const { colors } = theme;
  return StyleSheet.create({
    outer: { flex: 1, backgroundColor: colors.background },
    scrollInput: { flex: 1, backgroundColor: colors.background },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    // ── Header ─────────────────────────────────────────────
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerBack: {
      width: 32,
      height: 32,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerBackText: {
      fontSize: 22,
      fontWeight: '500',
      lineHeight: 24,
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
    },
    // ── Chat Messages ─────────────────────────────────────
    chatContent: {
      padding: Spacing.lg,
      paddingBottom: Spacing.xs,
    },
    messageBubble: {
      maxWidth: '80%',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      marginBottom: Spacing.md,
    },
    messageText: {
      ...Typography.body,
      lineHeight: 22,
    },
    // ── Input ─────────────────────────────────────────────
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: Spacing.sm,
    },
    input: {
      flex: 1,
      ...Typography.body,
      maxHeight: 100,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.xl,
    },
    sendBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendBtnText: { fontSize: 20, marginTop: -2 },
  });
}
