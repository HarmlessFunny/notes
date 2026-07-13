import type { ToolDefinition, ToolCallMap, ApiResponse } from '../types/index.js'
import {
  fetchAllNotes, fetchNotesByDay, fetchNotesByTitles,
  searchNotes as searchNotesSvc, addNote, updateNote, deleteNotes
} from '../services/database.js'

function _fetchNoteByTitle(title: string): ApiResponse {
  const result = fetchNotesByTitles([title])
  if (result.length > 0) {
    return { status: 'success', note: result[0] }
  }
  return { status: 'error', message: '笔记不存在' }
}

export const toolCallMap: ToolCallMap = {
  fetch_note_by_title: (args: { title: string }) => _fetchNoteByTitle(args.title),
  fetch_all_notes: () => ({ status: 'success', notes: fetchAllNotes() }) as unknown as ApiResponse,
  fetch_notes_by_day: (args: { someday: string }) => ({
    status: 'success',
    notes: fetchNotesByDay(args.someday)
  }) as unknown as ApiResponse,
  search_notes: (args: { keyword: string }) => ({
    status: 'success',
    notes: searchNotesSvc(args.keyword)
  }) as unknown as ApiResponse,
  add_note: (args: { title: string; subject: string; content?: string; timestamp?: string }) => {
    const err = addNote({
      title: args.title,
      subject: args.subject,
      time: args.timestamp || String(Date.now())
    }, args.content || '', [])
    if (err) return { status: 'error', message: err } as ApiResponse
    return { status: 'success' } as ApiResponse
  },
  delete_notes: (args: { titles: string[] }) => {
    const count = deleteNotes(args.titles)
    return { status: 'success', message: `已删除 ${count} 篇笔记`, deleted_count: count } as unknown as ApiResponse
  },
  update_note: (args: { old_title: string; new_title: string; subject: string; content?: string }) => {
    const err = updateNote(args.old_title, args.new_title, args.subject, args.content || '', [])
    if (err) return { status: 'error', message: err } as ApiResponse
    return { status: 'success', message: '笔记更新成功' } as ApiResponse
  }
}

export const tools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'fetch_note_by_title',
      description: '根据标题获取单篇笔记的详细内容',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '笔记标题' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_all_notes',
      description: '获取所有笔记的标题、科目列表',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_notes_by_day',
      description: '根据时间戳获取某一天需要复习的笔记标题、科目列表',
      parameters: {
        type: 'object',
        properties: {
          someday: { type: 'string', description: '毫秒级时间戳字符串（13位）' }
        },
        required: ['someday']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_notes',
      description: '根据关键词搜索笔记，匹配标题、科目（大小写不敏感），返回匹配的笔记标题、科目列表（如果想查看详细内容，调用fetch_note_by_title工具）',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词' }
        },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_note',
      description: '添加新笔记到数据库',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '笔记标题（唯一标识）' },
          subject: { type: 'string', description: '笔记科目' },
          content: { type: 'string', description: '笔记内容' },
          timestamp: { type: 'string', description: '毫秒级时间戳字符串' },
          imgs: { type: 'array', items: { type: 'string' }, description: '笔记图片URL列表' }
        },
        required: ['title', 'subject', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_notes',
      description: '根据标题列表批量删除多篇笔记及其关联的图片文件',
      parameters: {
        type: 'object',
        properties: {
          titles: { type: 'array', items: { type: 'string' }, description: '要删除的笔记标题数组' }
        },
        required: ['titles']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_note',
      description: '更新单篇笔记的标题、科目、内容等信息',
      parameters: {
        type: 'object',
        properties: {
          old_title: { type: 'string', description: '要修改的笔记的当前标题' },
          new_title: { type: 'string', description: '新标题' },
          subject: { type: 'string', description: '笔记科目' },
          content: { type: 'string', description: '笔记内容' }
        },
        required: ['old_title', 'new_title', 'subject', 'content']
      }
    }
  }
]
