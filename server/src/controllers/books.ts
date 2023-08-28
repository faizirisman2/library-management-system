import { DeleteResult, Filter, FindOptions, InsertOneResult, UpdateResult } from 'mongodb';
import { Book } from '../models/book';
import { collections } from '../database.js';

class BookController {
    errors = {
        UNKNOWN_INSERT_ERROR: 'Unable to create book',
        UNKNOWN_UPDATE_ERROR: 'Unable to update book',
        UNKNOWN_DELETE_ERROR: 'Unable to delete book',
        NOT_FOUND: 'Book not found',
        DETAILS_MISSING: 'Book details are missing',
        BOOK_ID_MISSING: 'Book id is missing',
        ADMIN_ONLY: 'This operation is only allowed for admins',
        NOT_AVAILABLE: 'Book is not available'
    };

    success = {
        CREATED: 'Book created',
        UPDATED: 'Book updated',
        DELETED: 'Book deleted'
    };

    public async getBooks(limit: number = 12, skip: number = 0): Promise<Book[]> {
        if (limit > 100) limit = 100;

        const filter = {} as Filter<Book>;
        const project = {_id: 0} as FindOptions<Book>;

        const bookCursor = await collections?.books?.find(filter, project);
        const books = bookCursor.limit(limit).skip(skip).toArray();

        return books;
    }

    public async getBook(bookId: string): Promise<Book> {
        const book = await collections?.books?.findOne({ _id: bookId });
        return book;
    }

    public async createBook(book: Book): Promise<InsertOneResult> {
        const result = await collections?.books?.insertOne(book);

        if (!result?.insertedId) {
            throw new Error(this.errors.UNKNOWN_INSERT_ERROR);
        }

        return result;
    }

    public async updateBook(bookId: string, book: Book): Promise<UpdateResult> {
        const result = await collections?.books?.updateOne({ _id: bookId }, { $set: book });

        if (result.modifiedCount === 0) {
            throw new Error(this.errors.UNKNOWN_UPDATE_ERROR);
        }

        return result;
    }

    public async deleteBook(bookId: string): Promise<DeleteResult> {
        const result = await collections?.books?.deleteOne({ _id: bookId });

        if (result.deletedCount === 0) {
            throw new Error(this.errors.UNKNOWN_UPDATE_ERROR);
        }
        if (!result) {
            throw new Error(this.errors.UNKNOWN_DELETE_ERROR);
        }

        return result;
    }

    public async computeAvailableBooks(bookId) {
        const updatePipeline = [
            { $match: { _id: bookId } },
            { $lookup: {
                from: 'issueDetails',
                localField: '_id',
                foreignField: 'book._id',
                pipeline: [ { $match: {
                    $or: [
                        {recordType: 'reservation'},
                        {recordType: 'borrowedBook', returned: false}
                    ]
                } } ],
                as: 'details' },
            },
            { $set: { available: { $subtract: ['$totalInventory', {$size: '$details'}] } } },
            { $unset: 'details' },
            { $merge: { into: 'books', on: '_id', whenMatched: 'replace' } }
        ];
        const result = collections?.books?.aggregate(updatePipeline);

        const items = await result.toArray();

        return items;
    }

    public async isBookAvailable(bookId: string): Promise<Book> {
        const bookData = await this.getBook(bookId);
        if (!bookData) throw new Error(this.errors.NOT_FOUND);
        if (bookData?.available <= 0) throw new Error(this.errors.NOT_AVAILABLE);

        return bookData;
    }
}

export default BookController;