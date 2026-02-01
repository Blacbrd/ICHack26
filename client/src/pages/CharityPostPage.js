import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import useTheme from '../lib/useTheme';
import './CharityPostPage.css';

const CharityPostPage = ({ user, profile }) => {
    const navigate = useNavigate();
    const [theme] = useTheme('light');
    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    // Image upload state
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);

    React.useEffect(() => {
        if (profile && !profile.is_charity) {
            navigate('/');
        }
    }, [profile, navigate]);

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!content.trim() && !imageFile) return;

        setSubmitting(true);
        setSuccess(false);

        try {
            let imageUrls = [];

            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `${user.id}/${Date.now()}.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('post_images')
                    .upload(fileName, imageFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('post_images')
                    .getPublicUrl(fileName);

                imageUrls.push(publicUrl);
            }

            const { error } = await supabase
                .from('posts')
                .insert({
                    charity_id: user.id,
                    content: content.trim(),
                    image_urls: imageUrls.length > 0 ? imageUrls : null
                });

            if (error) throw error;

            setSuccess(true);
            setContent('');
            setImageFile(null);
            setImagePreview(null);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err) {
            console.error('Error posting update:', err);
            alert('Failed to post update. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className={`charity-post-page ${theme}`}>
            <div className="cp-container">
                <div className="cp-header">
                    <button
                        onClick={() => navigate('/charity-referrals')}
                        className="cp-back-btn"
                    >
                        ← Back to Dashboard
                    </button>
                </div>

                <div className="cp-card">
                    <h1 className="cp-title">Post a New Update</h1>
                    <p style={{ marginBottom: '24px', opacity: 0.7 }}>
                        Share your impact! Your update will appear in the "Latest Updates" feed for all volunteers.
                    </p>

                    {success && (
                        <div className="cp-success">
                            ✓ Update posted successfully!
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="cp-form-group">
                            <label htmlFor="update-content" className="cp-label">
                                What have you been up to?
                            </label>
                            <textarea
                                id="update-content"
                                className="cp-textarea"
                                placeholder="Describe your recent activities, needs, or success stories..."
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                disabled={submitting}
                            />
                        </div>

                        <div className="cp-form-group">
                            <label className="cp-label">Add an Image (optional)</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <label
                                    htmlFor="file-upload"
                                    className="btn-upload"
                                    style={{
                                        padding: '8px 16px',
                                        border: '1px dashed rgba(28, 103, 230, 0.5)',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        color: '#1c67e6',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        background: 'rgba(28, 103, 230, 0.05)'
                                    }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                                    Choose Image
                                </label>
                                <input
                                    id="file-upload"
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageChange}
                                    style={{ display: 'none' }}
                                />
                                {imageFile && (
                                    <span style={{ fontSize: '14px', opacity: 0.8 }}>
                                        {imageFile.name}
                                        <button
                                            type="button"
                                            onClick={() => { setImageFile(null); setImagePreview(null); }}
                                            style={{ marginLeft: '8px', border: 'none', background: 'none', cursor: 'pointer', color: 'red' }}
                                        >✕</button>
                                    </span>
                                )}
                            </div>

                            {imagePreview && (
                                <div style={{ marginTop: '16px' }}>
                                    <img
                                        src={imagePreview}
                                        alt="Preview"
                                        style={{ maxHeight: '200px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)' }}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="cp-actions">
                            <button
                                type="submit"
                                className="btn-post"
                                disabled={submitting || (!content.trim() && !imageFile)}
                            >
                                {submitting ? 'Posting...' : 'Post Update'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CharityPostPage;
