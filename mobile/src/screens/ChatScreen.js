// Resolution Fitness App — AI Coach Chat Screen
// Messenger-inspired conversational UI for Mimi, the AI fitness coach.
// Theme-aware: bubbles, input bar, header, and chrome all flip with scheme.
//
// Header lives OUTSIDE the KeyboardAvoidingView so it stays pinned when the
// soft keyboard rises on iOS.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, Animated,
  Modal, Clipboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Shadows } from '../theme/spacing';
import MimiMark from '../components/MimiMark';

const WELCOME_MESSAGE = "Hey there! 💪 I'm your AI fitness coach. Ask me anything — workout tips, nutrition advice, form checks, or motivation. What can I help with today?";
const WELCOME_MESSAGE_OBJ = {
  id: 'welcome',
  role: 'assistant',
  content: WELCOME_MESSAGE,
  created_at: new Date().toISOString(),
};

// Marker appended by the backend when Mimi proposes a workout plan.
const PLAN_PROPOSAL_MARKER = '__PLAN_PROPOSAL__';

// Action tags embedded by the backend at the end of Mimi's responses.
// These become tappable buttons in the chat UI.
const ACTION_TAG_REGEX = /\[ACTION:(\w+)\]/g;

const ACTION_CONFIG = {
  CreatePlan: { label: 'Create Plan', icon: 'barbell-outline' },
  ViewPlan: { label: 'View Plan', icon: 'eye-outline' },
  StartWorkout: { label: 'Start Workout', icon: 'play-outline' },
  LogWeight: { label: 'Log Weight', icon: 'scale-outline' },
};

// Parse [ACTION:Name] tags from a message. Returns the cleaned text and a
// list of action names found in the message.
function parseActionTags(content) {
  if (!content) return { text: '', actions: [] };
  const actions = [];
  const text = content
    .replace(ACTION_TAG_REGEX, (match, actionName) => {
      if (ACTION_CONFIG[actionName]) {
        actions.push(actionName);
      }
      return '';
    })
    .trim();
  return { text, actions };
}

// Quick-reply suggestions shown above the input bar.
const QUICK_SUGGESTIONS = [
  'Workout plan for today',
  'Healthy meal ideas',
  'Form check tips',
  'Daily motivation',
  'Track my progress',
];

// ── Helpers ─────────────────────────────────────────────────────────

function formatTime(date) {
  const d = date ? new Date(date) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ── Components ──────────────────────────────────────────────────────

/**
 * Messenger-style message bubble.
 * - User messages: accent color, right-aligned, sharp bottom-right corner.
 * - Assistant messages: surface color, left-aligned, sharp bottom-left corner.
 * - Long-press opens an action menu (Delete, Copy, etc.).
 */
function ChatMessage({
  msg,
  isUser,
  colors,
  styles,
  onDelete,
  showAvatar,
  showTime,
}) {
  const [menuVisible, setMenuVisible] = useState(false);

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMenuVisible(true);
  };

  const { text: displayContent } = parseActionTags(msg.content);

  const handleDelete = () => {
    setMenuVisible(false);
    onDelete();
  };

  const handleCopy = () => {
    setMenuVisible(false);
    Clipboard.setString(msg.content);
  };

  const hasError = !!msg.error;

  const bubbleStyle = isUser
    ? {
        backgroundColor: hasError ? colors.accentWash : colors.accent,
        alignSelf: 'flex-end',
        borderBottomRightRadius: 4,
        borderBottomLeftRadius: BorderRadius.lg,
        borderTopRightRadius: BorderRadius.lg,
        borderTopLeftRadius: BorderRadius.lg,
      }
    : {
        backgroundColor: colors.surface,
        alignSelf: 'flex-start',
        borderBottomLeftRadius: 4,
        borderBottomRightRadius: BorderRadius.lg,
        borderTopRightRadius: BorderRadius.lg,
        borderTopLeftRadius: BorderRadius.lg,
        ...Shadows.sm,
      };

  const textColor = isUser
    ? hasError
      ? colors.error
      : colors.textInverse
    : colors.textPrimary;

  return (
    <>
      <View
        style={[
          styles.messageRow,
          isUser ? styles.messageRowUser : styles.messageRowAssistant,
        ]}
      >
        {!isUser && showAvatar && (
          <View style={styles.avatarContainer}>
            <MimiMark size={28} />
          </View>
        )}
        {!isUser && !showAvatar && <View style={styles.avatarSpacer} />}

        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={handleLongPress}
          delayLongPress={350}
          accessibilityRole="text"
          accessibilityLabel={`${isUser ? 'You' : 'Mimi'}: ${msg.content}`}
        >
          <View style={[styles.messageBubble, bubbleStyle]}>
            <Text style={[styles.messageText, { color: textColor }]}>
              {typeof displayContent === 'string' ? displayContent : String(displayContent ?? '')}
            </Text>
          </View>
        </TouchableOpacity>

      </View>

      {showTime && (
        <Text
          style={[
            styles.timestamp,
            isUser ? styles.timestampUser : styles.timestampAssistant,
            { color: colors.textMuted },
          ]}
        >
          {formatTime(msg.created_at)}
        </Text>
      )}

      <Modal
        transparent
        visible={menuVisible}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View
            style={[
              styles.contextMenu,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <TouchableOpacity
              style={styles.contextMenuItem}
              onPress={handleCopy}
            >
              <Text style={[styles.contextMenuText, { color: colors.textPrimary }]}>
                Copy
              </Text>
            </TouchableOpacity>
            <View style={[styles.contextMenuDivider, { backgroundColor: colors.divider }]} />
            <TouchableOpacity style={styles.contextMenuItem} onPress={handleDelete}>
              <Text style={[styles.contextMenuText, { color: colors.error }]}>
                Delete
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

/**
 * Typing indicator bubble shown while Mimi is generating a reply.
 */
function TypingIndicator({ colors, styles }) {
  return (
    <View style={[styles.messageRow, styles.messageRowAssistant]}>
      <View style={styles.avatarContainer}>
        <MimiMark size={28} />
      </View>
      <View
        style={[
          styles.typingBubble,
          { backgroundColor: colors.surface, ...Shadows.sm },
        ]}
      >
        <View style={styles.typingDots}>
          <Dot delay={0} color={colors.textMuted} styles={styles} />
          <Dot delay={150} color={colors.textMuted} styles={styles} />
          <Dot delay={300} color={colors.textMuted} styles={styles} />
        </View>
      </View>
    </View>
  );
}

function Dot({ delay, color, styles }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(scale, {
          toValue: 1.4,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [delay, scale]);

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: color, transform: [{ scale }] },
      ]}
    />
  );
}

// ── Screen ──────────────────────────────────────────────────────────

export default function ChatScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [pendingPlan, setPendingPlan] = useState(null);
  const scrollRef = useRef(null);
  const xhrRef = useRef(null);
  const idCounter = useRef(0);
  const nextId = useCallback(() => {
    idCounter.current += 1;
    return `msg-${idCounter.current}`;
  }, []);

  useEffect(() => {
    fetchHistory();
    return () => {
      if (xhrRef.current) {
        xhrRef.current.abort();
      }
    };
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
      setMessages([WELCOME_MESSAGE_OBJ]);
    } finally {
      setLoading(false);
    }
  };

  const hasHistory = messages.some((msg) => msg.role === 'user');

  // Extract action tags from the latest assistant message to render as a
  // persistent action bar above the input.
  const lastMessage = messages[messages.length - 1];
  const isLastMessageAssistant = lastMessage && lastMessage.role === 'assistant';
  const { actions: latestActions } = isLastMessageAssistant
    ? parseActionTags(lastMessage.content)
    : { actions: [] };

  const isLocalMessageId = (id) => {
    return !id || id === 'welcome' || String(id).startsWith('msg-');
  };

  const deleteMessage = async (index) => {
    const msg = messages[index];
    if (!msg) return;

    setMessages((prev) => prev.filter((_, i) => i !== index));

    if (!isLocalMessageId(msg.id)) {
      try {
        await api.deleteChatMessage(msg.id);
      } catch (err) {
        console.warn('Delete chat message failed:', err.message);
      }
    }
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Chat History',
      'Are you sure you want to clear your conversation with Mimi? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            if (xhrRef.current) {
              xhrRef.current.abort();
              xhrRef.current = null;
              setSending(false);
            }
            try {
              await api.clearChatHistory();
              setMessages([WELCOME_MESSAGE_OBJ]);
              setShowSuggestions(true);
              setPendingPlan(null);
            } catch (err) {
              console.warn('Clear chat history failed:', err.message);
              Alert.alert('Error', 'Failed to clear chat history. Please try again.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const submitMessage = async (text) => {
    if (!text || sending) return;

    const userMsg = { id: nextId(), role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setShowSuggestions(false);
    setSending(true);

    let streamedText = '';

    try {
      xhrRef.current = await api.sendChatMessageStream(
        text,
        (chunk) => {
          streamedText += chunk;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, id: last.id || nextId(), content: streamedText }];
            }
            return [...prev, { id: nextId(), role: 'assistant', content: streamedText }];
          });
        },
        () => {
          xhrRef.current = null;
          setSending(false);
          if (streamedText.includes(PLAN_PROPOSAL_MARKER) || streamedText.includes('[ACTION:CreatePlan]')) {
            setMessages((prev) => {
              let assistantMsg = null;
              for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i].role === 'assistant') {
                  assistantMsg = prev[i];
                  break;
                }
              }
              if (assistantMsg) {
                setPendingPlan({ userMessage: text });
              }
              return prev;
            });
          }
        },
        (err) => {
          console.warn('Chat stream failed:', err.message);
          xhrRef.current = null;
          setMessages((prev) => [...prev, {
            id: nextId(),
            role: 'assistant',
            content: 'Sorry, I had trouble connecting. Please try again.',
            error: true,
          }]);
          setSending(false);
        }
      );
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: nextId(),
        role: 'assistant',
        content: 'Sorry, I had trouble connecting. Please try again.',
        error: true,
      }]);
      setSending(false);
    }
  };

  const handleSend = () => submitMessage(inputText.trim());

  // Handle taps on action buttons embedded in Mimi's messages.
  const handleAction = (action) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    switch (action) {
      case 'CreatePlan':
        // Reuse the existing plan proposal flow. Find the most recent user
        // message before this assistant message to use as the plan request.
        {
          let assistantMsg = null;
          let userMsg = null;
          for (let i = messages.length - 1; i >= 0; i--) {
            if (!assistantMsg && messages[i].role === 'assistant') {
              assistantMsg = messages[i];
            }
            if (!userMsg && messages[i].role === 'user') {
              userMsg = messages[i];
            }
            if (assistantMsg && userMsg) break;
          }
          if (userMsg) {
            setPendingPlan({ userMessage: userMsg.content });
          }
        }
        break;
      case 'ViewPlan':
        navigation.navigate('Fitness', { screen: 'FitnessHome' });
        break;
      case 'StartWorkout':
        navigation.navigate('Fitness', { screen: 'FitnessHome' });
        break;
      case 'LogWeight':
        navigation.navigate('Health', { screen: 'HealthHome' });
        break;
      default:
        break;
    }
  };

  const handleSavePlan = async (routineType) => {
    if (!pendingPlan || !pendingPlan.userMessage) return;

    setSending(true);
    try {
      const result = await api.createChatPlan(pendingPlan.userMessage, routineType);
      const plan = result.data || result;
      const planName = plan?.name || 'your plan';

      const routineLabel = routineType === 'one_time' ? 'one-time plan' : 'routine';
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          content: `Done! I saved ${planName} as a ${routineLabel}. 💪`,
          created_at: new Date().toISOString(),
        },
      ]);
      setPendingPlan(null);
    } catch (err) {
      console.warn('Save plan failed:', err.message);
      Alert.alert('Error', 'Failed to save the plan. Please try again.');
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
      {/* ── Compact Messenger-style Header ─────────────────── */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
            paddingTop: Spacing.md + insets.top,
          },
        ]}
      >
        {navigation.canGoBack() && (
          <TouchableOpacity
            style={styles.headerBack}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.headerBackText, { color: colors.accent }]}>←</Text>
          </TouchableOpacity>
        )}

        <View style={styles.headerCenter}>
          <View style={styles.headerAvatarWrap}>
            <MimiMark size={32} />
            <View style={[styles.onlineIndicator, { backgroundColor: colors.success }]} />
          </View>
          <View style={styles.headerTextWrap}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Mimi</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
              AI Fitness Coach
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {hasHistory && !sending && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={handleClearHistory}
              accessibilityRole="button"
              accessibilityLabel="Clear chat history"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.clearBtnText, { color: colors.error }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
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
            const isLastAssistant = !isUser && idx === messages.length - 1;
            const showAvatar = !isUser;
            const showTime = isLastAssistant || isUser;
            return (
              <ChatMessage
                key={msg.id || idx}
                msg={msg}
                isUser={isUser}
                colors={colors}
                styles={styles}
                onDelete={() => deleteMessage(idx)}
                showAvatar={showAvatar}
                showTime={showTime}
              />
            );
          })}

          {sending && <TypingIndicator colors={colors} styles={styles} />}
        </ScrollView>

        {/* ── Quick-reply Suggestions ─────────────────────────── */}
        {showSuggestions && !sending && messages.length <= 1 && (
          <View style={styles.suggestionsWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.suggestionsContent}
              keyboardShouldPersistTaps="handled"
            >
              {QUICK_SUGGESTIONS.map((label) => (                  <TouchableOpacity
                  key={label}
                  style={[
                    styles.suggestionChip,
                    { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                  ]}
                  onPress={() => submitMessage(label)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.suggestionChipText, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Action Buttons (above input) ───────────────────── */}
        {!sending && (latestActions.length > 0 || pendingPlan) && (
          <View
            style={[
              styles.globalActionsWrap,
              { backgroundColor: colors.background, borderTopColor: colors.border },
            ]}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.globalActionsContent}
              keyboardShouldPersistTaps="handled"
            >
              {latestActions.map((action) => (
                <TouchableOpacity
                  key={action}
                  style={[styles.globalActionButton, { backgroundColor: colors.accent }]}
                  onPress={() => handleAction(action)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={ACTION_CONFIG[action].icon}
                    size={18}
                    color={colors.textInverse}
                    style={styles.globalActionButtonIcon}
                  />
                  <Text style={[styles.globalActionButtonText, { color: colors.textInverse }]}>
                    {ACTION_CONFIG[action].label}
                  </Text>
                </TouchableOpacity>
              ))}
              {pendingPlan && (
                <>
                  <TouchableOpacity
                    key="routine"
                    style={[styles.globalActionButton, { backgroundColor: colors.accent }]}
                    onPress={() => handleSavePlan('consistent')}
                    disabled={sending}
                  >
                    <Text style={[styles.globalActionButtonText, { color: colors.textInverse }]}>
                      Save as routine
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    key="one_time"
                    style={[styles.globalActionButton, { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1 }]}
                    onPress={() => handleSavePlan('one_time')}
                    disabled={sending}
                  >
                    <Text style={[styles.globalActionButtonText, { color: colors.accent }]}>
                      Save one-time
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        )}

        {/* ── Messenger-style Input Bar ───────────────────────── */}
        <View
          style={[
            styles.inputBar,
            { backgroundColor: colors.background, borderTopColor: colors.border },
          ]}
        >
          <View style={styles.inputInner}>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.surfaceMuted, color: colors.textPrimary },
              ]}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Message Mimi..."
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
              <Text style={[styles.sendBtnText, { color: colors.textInverse }]}>➤</Text>
            </TouchableOpacity>
          </View>
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
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      ...Shadows.sm,
    },
    headerBack: {
      width: 36,
      height: 36,
      justifyContent: 'center',
      alignItems: 'flex-start',
      marginRight: Spacing.sm,
    },
    headerBackText: {
      fontSize: 26,
      fontWeight: '400',
      lineHeight: 28,
    },
    headerCenter: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: Spacing.sm,
    },
    headerAvatarWrap: {
      position: 'relative',
    },
    onlineIndicator: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: colors.background,
    },
    headerTextWrap: {
      alignItems: 'center',
    },
    headerTitle: {
      ...Typography.bodyMedium,
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 20,
    },
    headerSubtitle: {
      ...Typography.caption,
      fontSize: 12,
      lineHeight: 16,
    },
    headerActions: {
      width: 60,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    clearBtn: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
    },
    clearBtnText: {
      ...Typography.body,
      fontSize: 14,
      fontWeight: '500',
    },

    // ── Chat Messages ─────────────────────────────────────
    chatContent: {
      padding: Spacing.md,
      paddingBottom: Spacing.sm,
    },
    messageRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginBottom: Spacing.sm,
    },
    messageRowUser: {
      justifyContent: 'flex-end',
    },
    messageRowAssistant: {
      justifyContent: 'flex-start',
    },
    avatarContainer: {
      width: 28,
      height: 28,
      marginRight: Spacing.sm,
      marginBottom: Spacing.xs,
    },
    avatarSpacer: {
      width: 28,
      marginRight: Spacing.sm,
    },
    messageBubble: {
      maxWidth: '78%',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.lg,
    },
    messageText: {
      ...Typography.body,
      fontSize: 16,
      lineHeight: 22,
    },
    timestamp: {
      ...Typography.caption,
      fontSize: 11,
      marginTop: 0,
      marginBottom: 0,
    },
    timestampUser: {
      alignSelf: 'flex-end',
      marginRight: Spacing.xs,
    },
    timestampAssistant: {
      alignSelf: 'flex-start',
      marginLeft: 40,
    },

    // ── Typing Indicator ──────────────────────────────────
    typingBubble: {
      maxWidth: '40%',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.lg,
      borderBottomLeftRadius: 4,
      justifyContent: 'center',
      alignItems: 'center',
      minWidth: 60,
      minHeight: 36,
    },
    typingDots: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },

    // ── Context Menu ──────────────────────────────────────
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
    },
    contextMenu: {
      width: 180,
      borderRadius: BorderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      ...Shadows.lg,
    },
    contextMenuItem: {
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      alignItems: 'center',
    },
    contextMenuText: {
      ...Typography.body,
      fontSize: 16,
      fontWeight: '500',
    },
    contextMenuDivider: {
      height: StyleSheet.hairlineWidth,
      marginHorizontal: Spacing.md,
    },

    // ── Plan Actions ─────────────────────────────────────
    planButton: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
    },
    planButtonText: {
      ...Typography.body,
      fontSize: 14,
      fontWeight: '600',
    },

    // ── Global Action Buttons (above input) ────────────────
    globalActionsWrap: {
      paddingVertical: Spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    globalActionsContent: {
      paddingHorizontal: Spacing.md,
    },
    globalActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      justifyContent: 'center',
      ...Shadows.sm,
      marginRight: Spacing.sm,
    },
    globalActionButtonIcon: {
      marginRight: Spacing.sm,
    },
    globalActionButtonText: {
      ...Typography.bodyMedium,
      fontSize: 16,
      fontWeight: '600',
    },

    // ── Suggestions ───────────────────────────────────────
    suggestionsWrap: {
      paddingVertical: Spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    suggestionsContent: {
      paddingHorizontal: Spacing.md,
    },
    suggestionChip: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      borderWidth: StyleSheet.hairlineWidth,
      marginRight: Spacing.sm,
    },
    suggestionChipText: {
      ...Typography.body,
      fontSize: 14,
      fontWeight: '500',
    },

    // ── Input ─────────────────────────────────────────────
    inputBar: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    inputInner: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: Spacing.sm,
    },
    input: {
      flex: 1,
      ...Typography.body,
      fontSize: 16,
      maxHeight: 100,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      lineHeight: 20,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendBtnText: {
      fontSize: 18,
      marginLeft: 2,
      marginTop: -1,
    },
  });
}
