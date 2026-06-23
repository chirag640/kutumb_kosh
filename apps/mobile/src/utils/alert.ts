import { Alert as RNAlert, Platform } from 'react-native';

export function showWebToast(title: string, message: string) {
  if (typeof document === 'undefined') return;

  // Get or create toast container
  let container = document.getElementById('kk-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'kk-toast-container';
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.right = '20px';
    container.style.zIndex = '999999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    document.body.appendChild(container);
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.style.background = 'rgba(25, 27, 22, 0.95)';
  toast.style.backdropFilter = 'blur(8px)';
  toast.style.color = '#e8ebe6';
  toast.style.padding = '14px 20px';
  toast.style.borderRadius = '12px';
  toast.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.1)';
  toast.style.display = 'flex';
  toast.style.flexDirection = 'column';
  toast.style.minWidth = '300px';
  toast.style.maxWidth = '420px';
  toast.style.opacity = '0';
  toast.style.transform = 'translateX(50px) scale(0.95)';
  toast.style.transition = 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
  toast.style.border = '1px solid rgba(255, 255, 255, 0.08)';

  // Determine border indicator color based on title context
  const normalizedTitle = title.toLowerCase();
  let indicatorColor = '#52b788'; // success green
  if (normalizedTitle.includes('error') || normalizedTitle.includes('failed') || normalizedTitle.includes('invalid') || normalizedTitle.includes('mismatch')) {
    indicatorColor = '#e63946'; // error red
  } else if (normalizedTitle.includes('warn') || normalizedTitle.includes('require')) {
    indicatorColor = '#f4a261'; // warning orange
  }
  toast.style.borderLeft = `5px solid ${indicatorColor}`;

  const titleEl = document.createElement('div');
  titleEl.style.fontWeight = '700';
  titleEl.style.fontSize = '14px';
  titleEl.style.lineHeight = '1.4';
  titleEl.style.marginBottom = '4px';
  titleEl.innerText = title;

  const msgEl = document.createElement('div');
  msgEl.style.fontSize = '12px';
  msgEl.style.lineHeight = '1.5';
  msgEl.style.color = '#a4a6a2';
  msgEl.innerText = message;

  toast.appendChild(titleEl);
  if (message) toast.appendChild(msgEl);
  container.appendChild(toast);

  // Trigger entering animation
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0) scale(1)';
  }, 10);

  // Trigger leaving animation and cleanup
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px) scale(0.95)';
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 4500);
}

export function showAlert(
  title: string,
  message?: string,
  buttons?: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[]
) {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    
    // Display our gorgeous custom web toast
    showWebToast(title, message || '');

    if (buttons && buttons.length > 0) {
      const primaryButton = buttons.find(b => b.style !== 'cancel') || buttons[0];
      
      if (buttons.length > 1) {
        // Multi-option triggers confirm dialog
        const ok = window.confirm(text);
        if (ok && primaryButton.onPress) {
          primaryButton.onPress();
        } else {
          const cancelButton = buttons.find(b => b.style === 'cancel');
          if (cancelButton && cancelButton.onPress) cancelButton.onPress();
        }
      } else {
        // Single button executes onPress immediately so browser flows are not blocked
        if (primaryButton && primaryButton.onPress) {
          primaryButton.onPress();
        }
      }
    }
  } else {
    // Native Alert dialogue
    RNAlert.alert(title, message, buttons);
  }
}
