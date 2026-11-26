import mongoose from 'mongoose';

const gallerySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: '',
      trim: true,
    },
    category: {
      type: String,
      enum: ['franchise', 'interiors', 'products', 'customers'],
      default: 'franchise',
    },
    image: {
      type: String,
      required: true,
    },
    caption: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        return ret;
      },
    },
  }
);

export default mongoose.model('Gallery', gallerySchema);
