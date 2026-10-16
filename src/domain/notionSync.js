const NOTION_VERSION = '2022-06-28';

export function extractNotionId(rawInput = '') {
  const cleaned = String(rawInput || '')
    .trim()
    .split('?')[0]
    .split('#')[0]
    .replace(/-/g, '');
  const match = cleaned.match(/([a-f0-9]{32})$/i) || cleaned.match(/([a-f0-9]{32})/i);
  if (!match) return '';
  const hex = match[1].toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function splitTextIntoChunks(text = '', maxLen = 1800) {
  const str = String(text || '').trim();
  if (!str) return ['(Chưa có nội dung chi tiết)'];
  const paragraphs = str.split(/\n\n+/);
  const chunks = [];
  for (const p of paragraphs) {
    if (p.length <= maxLen) {
      chunks.push(p);
    } else {
      for (let i = 0; i < p.length; i += maxLen) {
        chunks.push(p.slice(i, i + maxLen));
      }
    }
  }
  return chunks.slice(0, 80);
}

function buildContentBlocks(item) {
  const tagsStr = Array.isArray(item.tags) && item.tags.length > 0 ? item.tags.join(', ') : 'Không có';
  const metaLine = `Phân loại: ${item.type || 'script'} | Trạng thái: ${item.status || 'draft'} | Tác giả: ${
    item.author || 'Studio'
  } | Số từ: ${item.wordCount || 0} từ`;
  const assetLine = item.assetUrl ? `Link Tài nguyên / Drive: ${item.assetUrl}` : 'Link Tài nguyên: (Chưa gắn)';
  const tagLine = `Từ khóa / Tags: ${tagsStr} | Cập nhật lúc: ${new Date().toLocaleString('vi-VN')}`;

  const bodyChunks = splitTextIntoChunks(item.body || '');

  return [
    {
      object: 'block',
      type: 'callout',
      callout: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: `${metaLine}\n${assetLine}\n${tagLine}`,
            },
          },
        ],
        icon: { type: 'emoji', emoji: '🎬' },
      },
    },
    {
      object: 'block',
      type: 'divider',
      divider: {},
    },
    ...bodyChunks.map((chunk) => ({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content: chunk },
          },
        ],
      },
    })),
  ];
}

export async function syncContentToNotion(item, config = {}, fetchImpl = fetch) {
  const token = String(config.notionToken || process.env.NOTION_TOKEN || '').trim();
  const rawPageUrl = String(config.notionPageUrl || process.env.NOTION_PAGE_URL || '').trim();
  const parentPageId = extractNotionId(rawPageUrl);

  if (!token || !parentPageId) {
    return { synced: false, reason: 'missing_config' };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };

  const children = buildContentBlocks(item);

  // Nếu nội dung này đã từng tạo trang trên Notion -> Cập nhật tiêu đề & nội dung trang đó
  if (item.notionPageId) {
    const existingId = extractNotionId(item.notionPageId);
    if (existingId) {
      const patchRes = await fetchImpl(`https://api.notion.com/v1/pages/${existingId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          properties: {
            title: {
              title: [{ type: 'text', text: { content: item.title || 'Nội dung StudioFlow' } }],
            },
          },
        }),
      });

      if (patchRes.ok) {
        const pageData = await patchRes.json();
        // Xóa các block cũ để ghi nội dung mới nhất
        try {
          const blocksRes = await fetchImpl(
            `https://api.notion.com/v1/blocks/${existingId}/children?page_size=50`,
            { headers }
          );
          if (blocksRes.ok) {
            const blocksData = await blocksRes.json();
            for (const blk of blocksData.results || []) {
              await fetchImpl(`https://api.notion.com/v1/blocks/${blk.id}`, {
                method: 'DELETE',
                headers,
              });
            }
          }
        } catch {
          // Bỏ qua nếu không xóa được block cũ
        }

        await fetchImpl(`https://api.notion.com/v1/blocks/${existingId}/children`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ children }),
        });

        return {
          synced: true,
          notionPageId: pageData.id || existingId,
          notionUrl: pageData.url || item.notionUrl || `https://www.notion.so/${existingId.replace(/-/g, '')}`,
        };
      }
    }
  }

  // Tạo trang con mới bên trong File Notion đích của người dùng
  const createRes = await fetchImpl('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      parent: { page_id: parentPageId },
      icon: { type: 'emoji', emoji: '📝' },
      properties: {
        title: {
          title: [{ type: 'text', text: { content: item.title || 'Nội dung StudioFlow' } }],
        },
      },
      children,
    }),
  });

  if (!createRes.ok) {
    const errBody = await createRes.json().catch(() => ({}));
    throw new Error(
      errBody.message ||
        `Không thể kết nối Notion API (Mã lỗi ${createRes.status}). Hãy kiểm tra Token và quyền Connect trên trang Notion.`
    );
  }

  const createdPage = await createRes.json();
  return {
    synced: true,
    notionPageId: createdPage.id,
    notionUrl: createdPage.url || `https://www.notion.so/${String(createdPage.id).replace(/-/g, '')}`,
  };
}
